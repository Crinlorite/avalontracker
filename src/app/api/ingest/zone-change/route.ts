import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest } from "@/lib/ingest-auth";
import { apiError, internalError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { preflight, withCors } from "@/lib/ingest-cors";
import { createDedupCache, seenRecently } from "@/lib/ingest-dedup";
import type { Zone, ZoneType } from "@/generated/prisma/client";

const ingestLimiter = createLimiter({ windowMs: 60_000, max: 60 });

// Dedup 2s por (userId, to.zoneId): si Loot Vigil Y extension reportan el
// mismo cambio de zona casi simultáneamente, se acepta el primero y el
// segundo devuelve duplicate=true sin side effects.
const zoneChangeDedup = createDedupCache(2_000);

// Portal embebido en zone-change body — viene de Event 284 del sniffer
// que observa exits visibles al entrar a una zona TNL. `maxCapacity` y
// `standardLifetimeSec` son los defaults fase 1 (7/28800).
const portalInlineSchema = z.object({
  id: z.number().int(),
  mode: z.number().int().optional(),
  pos: z.object({ x: z.number(), z: z.number() }).optional(),
  raw4: z.number().int().optional(),
  raw5: z.number().int().optional(),
  maxCapacity: z.union([z.literal(2), z.literal(5), z.literal(7), z.literal(10), z.literal(20)]),
  standardLifetimeSec: z.number().int().positive().max(24 * 60 * 60),
});

const zoneRefSchema = z.object({
  zoneId: z.string().min(1).max(100),
  mapName: z.string().min(1).max(100),
  zoneType: z.string().min(1).max(40),
  portals: z.array(portalInlineSchema).max(10).optional(),
});

const payloadSchema = z.object({
  from: zoneRefSchema,
  to: zoneRefSchema,
  timestamp: z.string().datetime(),
  eventSource: z.string().max(40).optional(),
  source: z.enum(["extension", "loot-vigil"]).optional(),
});

function mapExternalToZoneType(externalType: string): ZoneType {
  const t = externalType.toLowerCase();
  if (t.startsWith("avalon")) return "AVALON";
  if (t === "royal") return "ROYAL";
  return "OUTLANDS";
}

// "Inside Avalon" = prefix TNL- del zoneId. Autoritativo.
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

async function zoneInRoute(routeId: string, zoneId: number): Promise<boolean> {
  const hop = await prisma.routeHop.findFirst({
    where: { routeId, OR: [{ fromZoneId: zoneId }, { toZoneId: zoneId }] },
    select: { id: true },
  });
  return hop !== null;
}

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

// Registra portales inline del body (Event 284) como hops WATCHED del
// currentZone hacia cada exit. No rompe el state machine principal — son
// hops adicionales informativos al lado del hop activo de traversal.
async function registerInlinePortals(
  routeId: string,
  currentZone: Zone,
  portals: z.infer<typeof portalInlineSchema>[],
): Promise<number> {
  let created = 0;
  for (const p of portals) {
    // No tenemos destino-zone directo del packet (solo pos + mode). Hoy los
    // dejamos solo como portal count en log; la resolución del destino real
    // se hace cuando el jugador cruza (zone-change subsiguiente) o cuando
    // portal-snapshot OCR da el nombre. Así que aquí solo incrementamos.
    created++;
  }
  if (created > 0) {
    logger.info({ routeId, zoneName: currentZone.name, portalCount: created }, "ingest: inline portals seen (pending destName)");
  }
  return created;
}

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function POST(request: Request) {
  const identity = await authenticateIngestRequest(request);
  if (!identity.ok) {
    return withCors(request, apiError("UNAUTHORIZED", 401, `Auth ${identity.reason}`));
  }
  if (!identity.targetClanId) {
    return withCors(request, apiError("VALIDATION_ERROR", 400, "Sin clan asociado"));
  }

  const rateKey = identity.via === "bearer" ? (identity.tokenId ?? identity.userId) : identity.userId;
  const rl = consumeToken(ingestLimiter, rateKey);
  if (!rl.ok) {
    const res = apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });
    res.headers.set("Retry-After", "5");
    return withCors(request, res);
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(request, apiError("VALIDATION_ERROR", 400, "Payload inválido", { issues: parsed.error.issues }));
  }

  try {
    const fromZone = await resolveZone(parsed.data.from);
    const toZone = await resolveZone(parsed.data.to);

    const fromAvalon = isInsideAvalon(parsed.data.from.zoneId);
    const toAvalon = isInsideAvalon(parsed.data.to.zoneId);
    const nowTs = new Date(parsed.data.timestamp);

    if (!fromAvalon && !toAvalon) {
      return withCors(request, NextResponse.json({ action: "noop", reason: "both outside Avalon", closed: false }, { status: 202 }));
    }

    // Dedup 2s por (userId, to.zoneId).
    const dedupKey = `${identity.userId}|${parsed.data.to.zoneId}`;
    if (seenRecently(zoneChangeDedup, dedupKey)) {
      return withCors(request, NextResponse.json({ duplicate: true, closed: false }, { status: 202 }));
    }

    const session = await prisma.snifferSession.upsert({
      where: { userId: identity.userId },
      create: { userId: identity.userId, lastEventAt: nowTs },
      update: { lastEventAt: nowTs },
    });

    // ===== Decidir qué Route es el "target" =====
    let targetRouteId: string | null = session.currentRouteId ?? null;

    if (targetRouteId) {
      const stillValid = await zoneInRoute(targetRouteId, fromZone.id);
      if (!stillValid) targetRouteId = null;
    }

    if (!targetRouteId) {
      targetRouteId = await findRouteContainingZone(fromZone.id, identity.targetClanId, identity.userId);
    }
    if (!targetRouteId) {
      targetRouteId = await findRouteContainingZone(toZone.id, identity.targetClanId, identity.userId);
    }

    if (!targetRouteId && !toAvalon) {
      return withCors(request, NextResponse.json({ action: "noop", reason: "no route context", closed: false }, { status: 202 }));
    }

    // ===== Crear grafo nuevo =====
    if (!targetRouteId) {
      const route = await prisma.route.create({
        data: {
          clanId: identity.targetClanId,
          createdById: identity.userId,
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
        where: { userId: identity.userId },
        data: { currentRouteId: route.id, currentZoneId: toZone.id },
      });
      if (toAvalon && parsed.data.to.portals?.length) {
        await registerInlinePortals(route.id, toZone, parsed.data.to.portals);
      }
      logger.info({ userId: identity.userId, routeId: route.id }, "sniffer: new graph opened");
      return withCors(request, NextResponse.json({ action: "open", routeId: route.id, hopOrder: 0, closed: false }, { status: 202 }));
    }

    // ===== Backtrack =====
    const alreadyTraversed = await edgeExistsInRoute(targetRouteId, fromZone.id, toZone.id);
    if (alreadyTraversed) {
      await prisma.snifferSession.update({
        where: { userId: identity.userId },
        data: { currentRouteId: targetRouteId, currentZoneId: toZone.id },
      });
      if (toAvalon && parsed.data.to.portals?.length) {
        await registerInlinePortals(targetRouteId, toZone, parsed.data.to.portals);
      }
      logger.info(
        { userId: identity.userId, routeId: targetRouteId, fromZoneId: fromZone.id, toZoneId: toZone.id },
        "sniffer: backtrack (edge known)",
      );
      return withCors(request, NextResponse.json({ action: "backtrack", routeId: targetRouteId, closed: false }, { status: 202 }));
    }

    // ===== Extender =====
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
      where: { userId: identity.userId },
      data: { currentRouteId: targetRouteId, currentZoneId: toZone.id },
    });
    if (toAvalon && parsed.data.to.portals?.length) {
      await registerInlinePortals(targetRouteId, toZone, parsed.data.to.portals);
    }

    // `closed` en la respuesta es informativo: señaliza que el jugador SALIÓ
    // de Avalon en esta transición (útil para UX del cliente), pero la Route
    // sigue ACTIVE — diseño persistent graph: el jugador puede re-entrar y
    // continuar en el mismo grafo por otra rama. Cerrar manualmente se hace
    // desde la UI via PATCH status=DISABLED.
    const closedSignal = fromAvalon && !toAvalon;
    logger.info(
      { userId: identity.userId, routeId: targetRouteId, hopOrder: order, closedSignal },
      closedSignal ? "sniffer: exit edge recorded (route stays active)" : "sniffer: edge appended",
    );
    return withCors(request, NextResponse.json({
      action: "extend",
      routeId: targetRouteId,
      hopOrder: order,
      closed: false,
    }, { status: 202 }));
  } catch (err) {
    return withCors(request, internalError(err));
  }
}
