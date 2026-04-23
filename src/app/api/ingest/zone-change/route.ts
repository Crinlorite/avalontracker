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

// Autoridad para "inside Avalon" = prefix del zoneId (recomendación Loot Vigil).
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

// ¿El edge {fromZoneId, toZoneId} ya existe en la ruta (en cualquier dirección)?
// Si existe, es re-traversal/backtrack — no debe crear hop duplicado.
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

async function nextHopOrder(routeId: string): Promise<number> {
  const last = await prisma.routeHop.findFirst({
    where: { routeId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return last ? last.order + 1 : 0;
}

const DEFAULT_PORTAL_SIZE = 20;
const DEFAULT_EXPIRES_MS = 2 * 60 * 60 * 1000; // 2h

export async function POST(request: Request) {
  const auth = await authenticateIngest(request);
  if (!auth.ok) return apiError("UNAUTHORIZED", 401, `Token ${auth.reason}`);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) return apiError("INSUFFICIENT_ROLE", 403, "Solo super admin");

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
      create: { userId: auth.userId, lastEventAt: nowTs, currentZoneId: toZone.id },
      update: { lastEventAt: nowTs },
    });

    // ===== OPEN: outside → avalon =====
    if (!fromAvalon && toAvalon) {
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
      logger.info({ userId: auth.userId, routeId: route.id }, "sniffer: route opened");
      return NextResponse.json({ action: "open", routeId: route.id, hopOrder: 0 }, { status: 202 });
    }

    // ===== AVALON → AVALON: in-run hop =====
    if (fromAvalon && toAvalon) {
      // Recovery: dentro de Avalon sin ruta abierta (reinicio sniffer). Abrir.
      if (!session.currentRouteId) {
        const route = await prisma.route.create({
          data: {
            clanId: auth.targetClanId,
            createdById: auth.userId,
            status: "ACTIVE",
            notes: "auto-sniffer (recovery)",
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
        logger.warn({ userId: auth.userId, routeId: route.id }, "sniffer: route recovered");
        return NextResponse.json({ action: "open", routeId: route.id, hopOrder: 0, recovered: true }, { status: 202 });
      }

      // ¿El edge ya existe en la ruta? Si sí, backtrack/re-traversal: no añadir hop.
      const alreadyTraversed = await edgeExistsInRoute(session.currentRouteId, fromZone.id, toZone.id);
      if (alreadyTraversed) {
        await prisma.snifferSession.update({
          where: { userId: auth.userId },
          data: { currentZoneId: toZone.id },
        });
        logger.info(
          { userId: auth.userId, routeId: session.currentRouteId, fromZoneId: fromZone.id, toZoneId: toZone.id },
          "sniffer: backtrack (edge existing)",
        );
        return NextResponse.json({ action: "backtrack", routeId: session.currentRouteId }, { status: 202 });
      }

      const order = await nextHopOrder(session.currentRouteId);
      await prisma.routeHop.create({
        data: {
          routeId: session.currentRouteId,
          order,
          fromZoneId: fromZone.id,
          toZoneId: toZone.id,
          portalSize: DEFAULT_PORTAL_SIZE,
          expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_MS),
        },
      });
      await prisma.route.update({
        where: { id: session.currentRouteId },
        data: { version: { increment: 1 } },
      });
      await prisma.snifferSession.update({
        where: { userId: auth.userId },
        data: { currentZoneId: toZone.id },
      });
      logger.info(
        { userId: auth.userId, routeId: session.currentRouteId, hopOrder: order },
        "sniffer: hop appended",
      );
      return NextResponse.json({ action: "append", routeId: session.currentRouteId, hopOrder: order }, { status: 202 });
    }

    // ===== AVALON → OUTSIDE: CLOSE =====
    if (fromAvalon && !toAvalon) {
      if (!session.currentRouteId) {
        logger.warn({ userId: auth.userId }, "sniffer: close without open, ignoring");
        return NextResponse.json({ action: "noop", reason: "no open route" }, { status: 202 });
      }

      const alreadyTraversed = await edgeExistsInRoute(session.currentRouteId, fromZone.id, toZone.id);
      let finalHopOrder: number | null = null;

      if (!alreadyTraversed) {
        const order = await nextHopOrder(session.currentRouteId);
        await prisma.routeHop.create({
          data: {
            routeId: session.currentRouteId,
            order,
            fromZoneId: fromZone.id,
            toZoneId: toZone.id,
            portalSize: DEFAULT_PORTAL_SIZE,
            expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_MS),
          },
        });
        finalHopOrder = order;
      }

      const closedRouteId = session.currentRouteId;
      await prisma.route.update({
        where: { id: closedRouteId },
        data: { version: { increment: 1 } },
      });
      await prisma.snifferSession.update({
        where: { userId: auth.userId },
        data: { currentRouteId: null, currentZoneId: null },
      });
      logger.info(
        { userId: auth.userId, routeId: closedRouteId, finalHopOrder },
        finalHopOrder === null ? "sniffer: route closed (backtrack exit)" : "sniffer: route closed (new exit hop)",
      );
      return NextResponse.json(
        { action: "close", routeId: closedRouteId, hopOrder: finalHopOrder },
        { status: 202 },
      );
    }

    return NextResponse.json({ action: "noop" }, { status: 202 });
  } catch (err) {
    return internalError(err);
  }
}
