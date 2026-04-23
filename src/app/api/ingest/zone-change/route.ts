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

// Loot Vigil manda zoneType "royal|avalonA/B/C|mists|..." que NO es nuestro
// enum. Mapeamos su crudo a nuestro ZoneType para zonas nuevas upserted.
function mapExternalToZoneType(externalType: string): ZoneType {
  const t = externalType.toLowerCase();
  if (t.startsWith("avalon")) return "AVALON";
  if (t === "royal") return "ROYAL";
  // resto (mists, hideout, arena, expedition, dungeon, hellgate, corrupted, island...) → OUTLANDS como bucket catch-all
  return "OUTLANDS";
}

// La autoridad para "¿está dentro de Avalon?" es el zoneId prefix, no el
// externalType — recomendación de Loot Vigil Claude. Hideouts bajo un TNL
// siguen siendo "dentro"; hideouts en royal no.
function isInsideAvalon(zoneId: string): boolean {
  return zoneId.startsWith("TNL-");
}

// Resuelve o crea una Zone dado zoneId/mapName/externalType. Devuelve la Zone.
// Estrategia:
//   1. Busca por externalZoneId — match exacto con lo que manda Loot Vigil.
//   2. Si no, busca por name (mapName) — para zonas ya seeded sin externalZoneId,
//      backfillea externalZoneId + externalType.
//   3. Si no, crea una nueva con name=mapName y type inferido.
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

export async function POST(request: Request) {
  // 1. Auth
  const auth = await authenticateIngest(request);
  if (!auth.ok) {
    const status = auth.reason === "missing" ? 401 : auth.reason === "revoked" ? 401 : 401;
    return apiError("UNAUTHORIZED", status, `Token ${auth.reason}`);
  }

  // 2. Defensa en profundidad: aunque solo emitimos tokens a super admin,
  // validamos el flag por si cambia en BD.
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) {
    return apiError("INSUFFICIENT_ROLE", 403, "Solo super admin");
  }

  // 3. Rate limit per-token
  const rl = consumeToken(ingestLimiter, auth.tokenId);
  if (!rl.ok) {
    return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });
  }

  // 4. Validar payload
  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", 400, "Payload inválido", { issues: parsed.error.issues });
  }

  try {
    const fromZone = await resolveZone(parsed.data.from);
    const toZone = await resolveZone(parsed.data.to);

    const fromAvalon = isInsideAvalon(parsed.data.from.zoneId);
    const toAvalon = isInsideAvalon(parsed.data.to.zoneId);

    // Outside → outside: ignorar (no nos importa tracking fuera de Avalon).
    if (!fromAvalon && !toAvalon) {
      return NextResponse.json({ action: "noop", reason: "both outside Avalon" }, { status: 202 });
    }

    // Carga/crea sesión del sniffer.
    const session = await prisma.snifferSession.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, lastEventAt: new Date(parsed.data.timestamp) },
      update: { lastEventAt: new Date(parsed.data.timestamp) },
    });

    // ----- Transición 1: outside → avalon = OPEN nueva ruta -----
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
              portalSize: 20,
              expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
            },
          },
        },
      });
      await prisma.snifferSession.update({
        where: { userId: auth.userId },
        data: { currentRouteId: route.id },
      });
      logger.info({ userId: auth.userId, routeId: route.id }, "sniffer: route opened");
      return NextResponse.json(
        { action: "open", routeId: route.id, hopOrder: 0 },
        { status: 202 },
      );
    }

    // ----- Transición 2: avalon → avalon = APPEND hop -----
    if (fromAvalon && toAvalon) {
      if (!session.currentRouteId) {
        // Edge case: dentro de Avalon sin ruta abierta (reinicio del sniffer,
        // o primer evento tras una desincronización). Tratamos como open.
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
                portalSize: 20,
                expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
              },
            },
          },
        });
        await prisma.snifferSession.update({
          where: { userId: auth.userId },
          data: { currentRouteId: route.id },
        });
        logger.warn({ userId: auth.userId, routeId: route.id }, "sniffer: route recovered (append without open)");
        return NextResponse.json(
          { action: "open", routeId: route.id, hopOrder: 0, recovered: true },
          { status: 202 },
        );
      }

      const lastHop = await prisma.routeHop.findFirst({
        where: { routeId: session.currentRouteId },
        orderBy: { order: "desc" },
      });
      const nextOrder = lastHop ? lastHop.order + 1 : 0;
      await prisma.routeHop.create({
        data: {
          routeId: session.currentRouteId,
          order: nextOrder,
          fromZoneId: fromZone.id,
          toZoneId: toZone.id,
          portalSize: 20,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });
      await prisma.route.update({
        where: { id: session.currentRouteId },
        data: { version: { increment: 1 } },
      });
      logger.info({ userId: auth.userId, routeId: session.currentRouteId, hopOrder: nextOrder }, "sniffer: hop appended");
      return NextResponse.json(
        { action: "append", routeId: session.currentRouteId, hopOrder: nextOrder },
        { status: 202 },
      );
    }

    // ----- Transición 3: avalon → outside = CLOSE ruta (con hop final de salida) -----
    if (fromAvalon && !toAvalon) {
      if (!session.currentRouteId) {
        logger.warn({ userId: auth.userId }, "sniffer: close without open, ignoring");
        return NextResponse.json({ action: "noop", reason: "no open route" }, { status: 202 });
      }
      const lastHop = await prisma.routeHop.findFirst({
        where: { routeId: session.currentRouteId },
        orderBy: { order: "desc" },
      });
      const nextOrder = lastHop ? lastHop.order + 1 : 0;
      await prisma.routeHop.create({
        data: {
          routeId: session.currentRouteId,
          order: nextOrder,
          fromZoneId: fromZone.id,
          toZoneId: toZone.id,
          portalSize: 20,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });
      const closedRouteId = session.currentRouteId;
      await prisma.route.update({
        where: { id: closedRouteId },
        data: { version: { increment: 1 } },
      });
      await prisma.snifferSession.update({
        where: { userId: auth.userId },
        data: { currentRouteId: null },
      });
      logger.info({ userId: auth.userId, routeId: closedRouteId }, "sniffer: route closed");
      return NextResponse.json(
        { action: "close", routeId: closedRouteId, hopOrder: nextOrder },
        { status: 202 },
      );
    }

    // Unreachable
    return NextResponse.json({ action: "noop" }, { status: 202 });
  } catch (err) {
    return internalError(err);
  }
}
