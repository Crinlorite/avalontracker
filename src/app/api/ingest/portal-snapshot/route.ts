import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest } from "@/lib/ingest-auth";
import { apiError, internalError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { preflight, withCors } from "@/lib/ingest-cors";
import { createDedupCache, seenRecently } from "@/lib/ingest-dedup";
import { resolveZoneByFuzzyName } from "@/lib/zone-name-resolver";

const snapshotLimiter = createLimiter({ windowMs: 60_000, max: 60 });

// Dedup: 30s window por (zoneId, destName, hours, minutes).
// Timer countdown permite soft-refresh cada 30s, más frecuente = spam OCR.
const snapshotDedup = createDedupCache(30_000);

const portalSchema = z.object({
  destName: z.string().min(1).max(80),
  hours: z.number().int().min(0).max(48),
  minutes: z.number().int().min(0).max(59),
  timerMinutes: z.number().int().min(0).max(48 * 60),
  // usesUsed/usesMax opcionales — el OCR de Loot Vigil a veces pierde la
  // línea de capacidad por el padlock icon que confunde Tesseract (issue #12).
  // Cuando faltan, el hop se guarda con portalSize default (20) y se podrá
  // enriquecer luego vía otro snapshot o con Event 284 inline cuando exista.
  usesUsed: z.number().int().min(0).max(40).optional(),
  usesMax: z.union([z.literal(2), z.literal(5), z.literal(7), z.literal(10), z.literal(20)]).optional(),
});

const payloadSchema = z.object({
  portals: z.array(portalSchema).min(1).max(10),
  timestamp: z.string().datetime(),
  source: z.enum(["extension", "loot-vigil"]),
  zoneNameGuess: z.string().min(1).max(80).optional(),
  zoneId: z.string().min(1).max(100).optional(),
  zoneType: z.string().min(1).max(40).optional(),
});

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
  const rl = consumeToken(snapshotLimiter, rateKey);
  if (!rl.ok) {
    const res = apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });
    res.headers.set("Retry-After", "5");
    return withCors(request, res);
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(
      request,
      apiError("VALIDATION_ERROR", 400, "Payload inválido", { issues: parsed.error.issues }),
    );
  }

  try {
    // Resolver la zona actual: si el cliente mandó zoneId explícito lo priorizamos,
    // si no usamos el OCR guess con resolver fuzzy.
    let currentZone: { id: number; name: string } | null = null;
    if (parsed.data.zoneId) {
      const byExternalId = await prisma.zone.findUnique({
        where: { externalZoneId: parsed.data.zoneId },
        select: { id: true, name: true },
      });
      if (byExternalId) currentZone = byExternalId;
    }
    if (!currentZone && parsed.data.zoneNameGuess) {
      currentZone = await resolveZoneByFuzzyName(parsed.data.zoneNameGuess);
    }
    if (!currentZone) {
      return withCors(
        request,
        apiError("VALIDATION_ERROR", 400, "No se pudo resolver la zona actual (ni zoneId ni zoneNameGuess)"),
      );
    }

    // Identificar el Route activo del user que contiene currentZone como nodo.
    // Si ninguno lo tiene, creamos uno nuevo con currentZone como anchor.
    let targetRoute = await prisma.route.findFirst({
      where: {
        clanId: identity.targetClanId,
        createdById: identity.userId,
        status: "ACTIVE",
        hops: { some: { OR: [{ fromZoneId: currentZone.id }, { toZoneId: currentZone.id }] } },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    let matched = 0;
    let created = 0;
    let ignored = 0;
    const hopIds: number[] = [];

    for (const portal of parsed.data.portals) {
      const dedupKey = `${currentZone.id}|${portal.destName}|${portal.hours}|${portal.minutes}`;
      if (seenRecently(snapshotDedup, dedupKey)) {
        ignored++;
        continue;
      }

      // Resolver zona destino por nombre (OCR). Si no se resuelve la marcamos
      // como ignored en lugar de crear placeholders — low confidence.
      const destZone = await resolveZoneByFuzzyName(portal.destName);
      if (!destZone) {
        ignored++;
        continue;
      }

      // ¿Ya existe un hop entre currentZone y destZone en alguna ruta del clan?
      const existingHop = await prisma.routeHop.findFirst({
        where: {
          route: { clanId: identity.targetClanId },
          OR: [
            { fromZoneId: currentZone.id, toZoneId: destZone.id },
            { fromZoneId: destZone.id, toZoneId: currentZone.id },
          ],
        },
        select: { id: true, routeId: true, expiresAt: true, status: true },
      });

      const expiresAt = new Date(Date.now() + portal.timerMinutes * 60_000);
      // usesMax puede venir undefined si el OCR falló en la capacidad.
      // Usamos 20 como fallback (portalSize Int no-null en schema) —
      // coincide con el default del auto-sniffer. Se podrá refinar con
      // otro snapshot que sí capture la capacidad.
      const PORTAL_SIZE_FALLBACK = 20;
      const effectivePortalSize = portal.usesMax ?? PORTAL_SIZE_FALLBACK;

      if (existingHop) {
        // Match: refrescamos timer si el nuevo es posterior al existente.
        // NO pisamos portalSize existente con el fallback — solo lo
        // actualizamos si el nuevo snapshot trae una capacidad explícita.
        if (expiresAt > existingHop.expiresAt) {
          await prisma.routeHop.update({
            where: { id: existingHop.id },
            data: {
              expiresAt,
              status: "ACTIVE",
              ...(portal.usesMax !== undefined ? { portalSize: portal.usesMax } : {}),
            },
          });
        }
        matched++;
        hopIds.push(existingHop.id);
        continue;
      }

      // Crear hop nuevo. Si tenemos route target, añadir ahí; si no, abrir uno.
      if (!targetRoute) {
        const newRoute = await prisma.route.create({
          data: {
            clanId: identity.targetClanId,
            createdById: identity.userId,
            status: "ACTIVE",
            notes: "auto-ocr-snapshot",
          },
          select: { id: true },
        });
        targetRoute = newRoute;
      }

      const lastOrder = await prisma.routeHop.findFirst({
        where: { routeId: targetRoute.id },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const nextOrder = lastOrder ? lastOrder.order + 1 : 0;

      const newHop = await prisma.routeHop.create({
        data: {
          routeId: targetRoute.id,
          order: nextOrder,
          fromZoneId: currentZone.id,
          toZoneId: destZone.id,
          portalSize: effectivePortalSize,
          expiresAt,
          status: "WATCHED",
        },
        select: { id: true },
      });
      await prisma.route.update({
        where: { id: targetRoute.id },
        data: { version: { increment: 1 } },
      });
      created++;
      hopIds.push(newHop.id);
    }

    logger.info(
      { userId: identity.userId, currentZone: currentZone.name, matched, created, ignored },
      "ingest: portal snapshot processed",
    );

    return withCors(
      request,
      NextResponse.json({ matched, created, ignored, hopIds }, { status: 202 }),
    );
  } catch (err) {
    return withCors(request, internalError(err));
  }
}
