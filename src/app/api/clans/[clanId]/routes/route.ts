import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const createLim = createLimiter({ windowMs: 60_000, max: 20 });

const hopSchema = z.object({
  fromZone: z.string().min(1).max(100),
  toZone: z.string().min(1).max(100),
  portalSize: z.union([z.literal(7), z.literal(20), z.literal(40)]),
  expiresAt: z.string().datetime(),
});

const createSchema = z.object({
  hops: z.array(hopSchema).min(1).max(12),
  notes: z.string().max(200).optional(),
}).refine((d) => d.hops.every((h, i) => i === 0 || h.fromZone === d.hops[i - 1].toZone), {
  message: "Cadena no continua",
  path: ["hops"],
});

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const status = url.searchParams.get("status") as "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL" | null;

  // Mantenimiento lazy: antes de leer hacemos varios barridos sin
  // cron ni scheduler. Se mantienen idempotentes y baratos (queries
  // con índices).
  //   1) ACTIVE → EXPIRED si TODOS los hops VIVOS están vencidos.
  //      Hops con deletedAt no cuentan — ya no son parte funcional de
  //      la cadena. `none` con la condición invertida + `some` para
  //      evitar el caso vacuoso de una route sin hops vivos.
  //   2) Hard-delete de RouteHops con deletedAt > 7 días: ventana de
  //      recuperación cerrada, fuera del DB.
  //   3) Hard-delete de Routes que han quedado sin hops vivos NI
  //      soft-deleted (todo limpiado por el paso 2 o nunca tuvieron).
  //   4) Hard-delete de Routes EXPIRED con updatedAt > 7 días (legacy
  //      para EXPIRED automáticas — el ttl real va por deletedAt en
  //      hops desde este commit).
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1) Transición a EXPIRED contando solo hops vivos.
  await prisma.route.updateMany({
    where: {
      clanId,
      status: "ACTIVE",
      hops: {
        // No hay ningún hop vivo y aún sin expirar (i.e. todos los
        // vivos ya expiraron).
        none: { deletedAt: null, expiresAt: { gt: now } },
        // Pero al menos hay un hop vivo (vacuoso si ninguno).
        some: { deletedAt: null },
      },
    },
    data: { status: "EXPIRED" },
  });

  // 2) Hard-delete de hops soft-borrados hace > 7 días.
  await prisma.routeHop.deleteMany({
    where: {
      route: { clanId },
      deletedAt: { lt: sevenDaysAgo },
    },
  });

  // 3) Hard-delete de Routes que ya no tienen ningún hop (ni vivo ni
  // soft-deleted) — el paso 2 puede haber dejado huérfanas.
  await prisma.route.deleteMany({
    where: { clanId, hops: { none: {} } },
  });

  // 4) Hard-delete legacy de EXPIRED viejas (para datos previos a
  // la migración a soft-delete por hop).
  await prisma.route.deleteMany({
    where: { clanId, status: "EXPIRED", updatedAt: { lt: sevenDaysAgo } },
  });

  const where: Record<string, unknown> = { clanId };
  if (status && status !== "ALL") where.status = status;
  else if (!status) where.status = "ACTIVE";
  if (since) where.updatedAt = { gt: new Date(since) };

  const routes = await prisma.route.findMany({
    where,
    include: {
      // Solo hops vivos en la respuesta — los soft-deleted no aparecen
      // en la UI normal (recuperación es vía endpoint específico, no
      // aquí). Mantiene el contrato existente del frontend.
      hops: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { fromZone: true, toZone: true },
      },
      createdBy: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ routes, now: now.toISOString() });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(createLim, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas rutas creadas", { retryAfterMs: rl.retryAfterMs });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const zoneNames = new Set<string>();
  for (const h of parsed.data.hops) { zoneNames.add(h.fromZone); zoneNames.add(h.toZone); }
  const zones = await prisma.zone.findMany({ where: { name: { in: [...zoneNames] } } });
  const byName = new Map(zones.map((z) => [z.name, z.id]));
  for (const n of zoneNames) if (!byName.has(n)) {
    return apiError("VALIDATION_ERROR", 400, `Zona desconocida: ${n}`);
  }

  const route = await prisma.route.create({
    data: {
      clanId,
      createdById: session.user.id,
      notes: parsed.data.notes ?? null,
      hops: {
        create: parsed.data.hops.map((h, i) => ({
          order: i,
          fromZoneId: byName.get(h.fromZone)!,
          toZoneId: byName.get(h.toZone)!,
          portalSize: h.portalSize,
          expiresAt: new Date(h.expiresAt),
        })),
      },
    },
    include: { hops: { orderBy: { order: "asc" } } },
  });

  await logAudit(clanId, session.user.id, "ROUTE_CREATE", route.id, { hopCount: parsed.data.hops.length });

  return NextResponse.json(route, { status: 201 });
}
