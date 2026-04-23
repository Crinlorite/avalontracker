import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateIngest } from "@/lib/ingest-token";
import { apiError, internalError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { Zone, ZoneType } from "@/generated/prisma/client";

const ingestLimiter = createLimiter({ windowMs: 60_000, max: 60 });

const zoneRefSchema = z.object({
  zoneId: z.string().min(1).max(100),
  mapName: z.string().min(1).max(100),
  zoneType: z.string().min(1).max(40),
});

const payloadSchema = z.object({
  from: zoneRefSchema,
  to: zoneRefSchema,
  timestamp: z.string().datetime(),
  eventSource: z.string().max(40).optional(),
});

function mapExternalToZoneType(externalType: string): ZoneType {
  const t = externalType.toLowerCase();
  if (t.startsWith("avalon")) return "AVALON";
  if (t === "royal") return "ROYAL";
  return "OUTLANDS";
}

// "Inside Avalon" = prefix TNL- del zoneId. Autoritativo según Loot Vigil Claude.
function isInsideAvalon(zoneId: string): boolean {
  return zoneId.startsWith("TNL-");
}

async function resolveZone(ref: { zoneId: string; mapName: string; zoneType: string }): Promise<Zone> {
  const existingById = await prisma.zone.findUnique({ where: { externalZoneId: ref.zoneId } });
  if (existingById) return existingById;

  const byName = await prisma.zone.findUnique({ where: { name: ref.mapName } });
  if (byName) {
    return prisma.zone.update({
      where: { id: byName.id },
      data: { externalZoneId: ref.zoneId, externalType: ref.zoneType },
    });
  }

  return prisma.zone.create({
    data: {
      name: ref.mapName,
      type: mapExternalToZoneType(ref.zoneType),
      externalZoneId: ref.zoneId,
      externalType: ref.zoneType,
    },
  });
}

// ¿El edge {zoneA, zoneB} ya existe en la ruta en cualquier dirección?
async function edgeExistsInRoute(routeId: string, zoneA: number, zoneB: number): Promise<boolean> {
  const hop = await prisma.routeHop.findFirst({
    where: {
      routeId,
      OR: [
        { fromZoneId: zoneA, toZoneId: zoneB },
        { fromZoneId: zoneB, toZoneId: zoneA },
      ],
    },
    select: { id: true },
  });
  return hop !== null;
}

// ¿La zona zoneId aparece como nodo (from o to) en alguna hop de la ruta?
async function zoneInRoute(routeId: string, zoneId: number): Promise<boolean> {
  const hop = await prisma.routeHop.findFirst({
    where: {
      routeId,
      OR: [{ fromZoneId: zoneId }, { toZoneId: zoneId }],
    },
    select: { id: true },
  });
  return hop !== null;
}

// Busca una ruta activa del user/clan que contenga la zona dada como nodo.
// Prefiere la más recientemente actualizada.
async function findRouteContainingZone(
  zoneId: number,
  clanId: string,
  userId: string,
): Promise<string | null> {
  const route = await prisma.route.findFirst({
    where: {
      clanId,
      createdById: userId,
      status: "ACTIVE",
      hops: { some: { OR: [{ fromZoneId: zoneId }, { toZoneId: zoneId }] } },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return route?.id ?? null;
}

async function nextHopOrder(routeId: string): Promise<number> {
  const last = await prisma.routeHop.findFirst({
    where: { routeId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return last ? last.order + 1 : 0;
}

const DEFAULT_PORTAL_SIZE = 20;
const DEFAULT_EXPIRES_MS = 2 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await authenticateIngest(request);
  if (!auth.ok) return apiError("UNAUTHORIZED", 401, `Token ${auth.reason}`);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) return apiError("INSUFFICIENT_ROLE", 403, "Sin permisos");

  const rl = consumeToken(ingestLimiter, auth.tokenId);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Payload inválido", { issues: parsed.error.issues });

  try {
    const fromZone = await resolveZone(parsed.data.from);
    const toZone = await resolveZone(parsed.data.to);

    const fromAvalon = isInsideAvalon(parsed.data.from.zoneId);
    const toAvalon = isInsideAvalon(parsed.data.to.zoneId);
    const nowTs = new Date(parsed.data.timestamp);

    if (!fromAvalon && !toAvalon) {
      return NextResponse.json({ action: "noop", reason: "both outside Avalon" }, { status: 202 });
    }

    const session = await prisma.snifferSession.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, lastEventAt: nowTs },
      update: { lastEventAt: nowTs },
    });

    // ===== Decidir qué Route es el "target" =====
    // Prioridad:
    //   1. session.currentRouteId, si la zona origen ya aparece en ese grafo
    //   2. Cualquier ruta activa del user/clan que contenga fromZone
    //   3. Cualquier ruta activa que contenga toZone (re-entrando a un grafo ya conocido)
    //   4. Si nada, crear nueva — solo si toAvalon (si no, noop)
    let targetRouteId: string | null = session.currentRouteId ?? null;

    if (targetRouteId) {
      const stillValid = await zoneInRoute(targetRouteId, fromZone.id);
      if (!stillValid) targetRouteId = null;
    }

    if (!targetRouteId) {
      targetRouteId = await findRouteContainingZone(fromZone.id, auth.targetClanId, auth.userId);
    }
    if (!targetRouteId) {
      targetRouteId = await findRouteContainingZone(toZone.id, auth.targetClanId, auth.userId);
    }

    // ===== Ningún grafo conocido + no entras a Avalon = ignorar =====
    if (!targetRouteId && !toAvalon) {
      return NextResponse.json({ action: "noop", reason: "no route context" }, { status: 202 });
    }

    // ===== Crear grafo nuevo (primera vez entrando a una zona no conocida) =====
    if (!targetRouteId) {
      const route = await prisma.route.create({
        data: {
          clanId: auth.targetClanId,
          createdById: auth.userId,
          status: "ACTIVE",
          notes: "auto-sniffer",
          hops: {
            create: {
              order: 0,
              fromZoneId: fromZone.id,
              toZoneId: toZone.id,
              portalSize: DEFAULT_PORTAL_SIZE,
              expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_MS),
            },
          },
        },
      });
      await prisma.snifferSession.update({
        where: { userId: auth.userId },
        data: { currentRouteId: route.id, currentZoneId: toZone.id },
      });
      logger.info({ userId: auth.userId, routeId: route.id }, "sniffer: new graph opened");
      return NextResponse.json({ action: "open", routeId: route.id, hopOrder: 0 }, { status: 202 });
    }

    // ===== Backtrack: edge ya existe en el grafo =====
    const alreadyTraversed = await edgeExistsInRoute(targetRouteId, fromZone.id, toZone.id);
    if (alreadyTraversed) {
      await prisma.snifferSession.update({
        where: { userId: auth.userId },
        data: { currentRouteId: targetRouteId, currentZoneId: toZone.id },
      });
      logger.info(
        { userId: auth.userId, routeId: targetRouteId, fromZoneId: fromZone.id, toZoneId: toZone.id },
        "sniffer: backtrack (edge known)",
      );
      return NextResponse.json({ action: "backtrack", routeId: targetRouteId }, { status: 202 });
    }

    // ===== Extender grafo con edge nuevo =====
    const order = await nextHopOrder(targetRouteId);
    await prisma.routeHop.create({
      data: {
        routeId: targetRouteId,
        order,
        fromZoneId: fromZone.id,
        toZoneId: toZone.id,
        portalSize: DEFAULT_PORTAL_SIZE,
        expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_MS),
      },
    });
    await prisma.route.update({
      where: { id: targetRouteId },
      data: { version: { increment: 1 } },
    });
    await prisma.snifferSession.update({
      where: { userId: auth.userId },
      data: { currentRouteId: targetRouteId, currentZoneId: toZone.id },
    });
    logger.info(
      { userId: auth.userId, routeId: targetRouteId, hopOrder: order, fromAvalon, toAvalon },
      fromAvalon && !toAvalon
        ? "sniffer: exit edge recorded (route stays open)"
        : "sniffer: edge appended",
    );
    return NextResponse.json(
      { action: "extend", routeId: targetRouteId, hopOrder: order },
      { status: 202 },
    );
  } catch (err) {
    return internalError(err);
  }
}
