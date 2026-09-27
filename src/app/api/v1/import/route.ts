import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { decodeRouteCode } from "@/lib/route-codec";
import { createPersonalMap, MAX_PERSONAL_MAPS } from "@/lib/personal-maps";
import { logAudit } from "@/lib/audit";
import { touchGuest } from "@/lib/guest";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

// Como la creación de rutas en la web: 20 importaciones por minuto y usuario.
const importLimiter = createLimiter({ windowMs: 60_000, max: 20 });

const schema = z.object({ code: z.string().min(8).max(8000) }).strict();

// El código admite 1..100; aquí, como en la sincronización (espejo de
// datos, spec §6.2): tamaños actuales 7 y 20 y heredados 2 y 40.
const PORTAL_SIZES = new Set([2, 7, 20, 40]);

// Importa una ruta compartida por código v1 al primer mapa personal del
// usuario (lo crea si no tiene). Los saltos se guardan tal cual, incluidos
// los caducados: la papelera y los tiempos ya los tratan como en la web.
export async function POST(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  if (!consumeToken(importLimiter, me.userId).ok) return apiError("RATE_LIMITED", 429, "Demasiadas importaciones");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  const decoded = decodeRouteCode(parsed.data.code);
  if (!decoded.ok) {
    return apiError("VALIDATION_ERROR", 400, decoded.reason === "unsupported_version" ? "Este código es de una versión más nueva de la app" : "Código no válido");
  }
  const badSize = decoded.route.hops.find((h) => !PORTAL_SIZES.has(h.portalSize));
  if (badSize) return apiError("VALIDATION_ERROR", 400, `Tamaño de portal no válido: ${badSize.portalSize}`, { portalSize: badSize.portalSize });
  try {
    const names = [...new Set(decoded.route.hops.flatMap((h) => [h.fromZone, h.toZone]))];
    const zones = await prisma.zone.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
    const zoneId = new Map(zones.map((z) => [z.name, z.id]));
    const missing = names.find((n) => !zoneId.has(n));
    if (missing) return apiError("VALIDATION_ERROR", 400, `Zona desconocida: ${missing}`, { zone: missing });

    let map = await prisma.clan.findFirst({ where: { createdById: me.userId, kind: "PERSONAL" }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (!map) {
      const created = await createPersonalMap(me.userId);
      if ("error" in created && created.error === "NO_USER") return apiError("UNAUTHORIZED", 401, "Inicia sesión");
      if ("error" in created) return apiError("VALIDATION_ERROR", 400, `Máximo ${MAX_PERSONAL_MAPS} mapas personales`);
      map = { id: created.id };
    }
    const seen = new Set<string>();
    const hops = decoded.route.hops.filter((h) => { const k = `${h.fromZone}>${h.toZone}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const route = await prisma.route.create({
      data: {
        clanId: map.id, createdById: me.userId, notes: decoded.route.notes ?? null,
        hops: { create: hops.map((h, i) => ({ order: i, fromZoneId: zoneId.get(h.fromZone)!, toZoneId: zoneId.get(h.toZone)!, portalSize: h.portalSize, expiresAt: h.expiresAt, status: h.status, statusNote: h.statusNote ?? null })) },
      },
      select: { id: true },
    });
    await logAudit(map.id, me.userId, "ROUTE_CREATE", route.id, { via: "import", hopCount: hops.length });
    await touchGuest(me.userId);
    return NextResponse.json({ clanId: map.id, routeId: route.id }, { status: 201 });
  } catch (err) { return internalError(err); }
}
