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

  // Caducidad lazy: antes de leer, transicionamos ACTIVE → EXPIRED las
  // rutas con TODOS los hops ya vencidos. Sin cron ni scheduler — el
  // barrido va en la propia consulta por clan. Usamos `every` para que
  // rutas con al menos una puerta viva sigan visibles (decisión
  // explícita: no descatalogar mientras parte de la cadena exista).
  // `some: {}` previene el caso vacuoso de una ruta sin hops.
  const now = new Date();
  await prisma.route.updateMany({
    where: {
      clanId,
      status: "ACTIVE",
      hops: { every: { expiresAt: { lt: now } }, some: {} },
    },
    data: { status: "EXPIRED" },
  });

  const where: Record<string, unknown> = { clanId };
  if (status && status !== "ALL") where.status = status;
  else if (!status) where.status = "ACTIVE";
  if (since) where.updatedAt = { gt: new Date(since) };

  const routes = await prisma.route.findMany({
    where,
    include: {
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
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
