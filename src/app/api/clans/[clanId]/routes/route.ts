import { NextResponse } from "next/server";
import { z } from "zod";
import { portalSizeSchema } from "@/lib/portal-size";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const createLim = createLimiter({ windowMs: 60_000, max: 20 });

const hopSchema = z.object({
  fromZone: z.string().min(1).max(100),
  toZone: z.string().min(1).max(100),
  portalSize: portalSizeSchema,
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
    await requireRole(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const status = url.searchParams.get("status") as "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL" | null;

  // Mantenimiento lazy antes de leer: ACTIVE → EXPIRED si TODOS los
  // hops VIVOS están vencidos. Hops con deletedAt no cuentan — ya no son
  // parte funcional de la cadena. `none` con la condición invertida +
  // `some` para evitar el caso vacuoso de una route sin hops vivos.
  // El vaciado de la papelera (hard-delete pasado el TTL) no va aquí:
  // es la tarea de fondo sweepTrash de instrumentation.ts.
  const now = new Date();

  // 1) Transición a EXPIRED + soft-delete de hops cuando la chain
  //    entera ha caducado. Unificamos con el flujo manual de borrado:
  //    auto-expiración y borrado-por-usuario producen el mismo
  //    estado (deletedAt en los hops) y comparten el TTL de 2 días.
  //    Beneficio: una sola lógica de recuperación, una sola fecha de
  //    barrido. Si dentro de los 2 días el usuario añade un hop a una
  //    Route EXPIRED, resurrecciona a ACTIVE con el hop nuevo (los
  //    soft-deleted antiguos no estorban — quedan filtrados).
  const expiringRoutes = await prisma.route.findMany({
    where: {
      clanId,
      status: "ACTIVE",
      hops: {
        none: { deletedAt: null, expiresAt: { gt: now } },
        some: { deletedAt: null },
      },
    },
    select: { id: true },
  });
  if (expiringRoutes.length > 0) {
    const expiringIds = expiringRoutes.map((r) => r.id);
    await prisma.$transaction([
      prisma.route.updateMany({
        where: { id: { in: expiringIds } },
        data: { status: "EXPIRED", deletedAt: now },
      }),
      prisma.routeHop.updateMany({
        where: { routeId: { in: expiringIds }, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);
  }

  // Las rutas en papelera (Route.deletedAt, p. ej. borradas desde la app) no se listan.
  const where: Record<string, unknown> = { clanId, deletedAt: null };
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
    await requireRole(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
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

  // Pre-check: dentro del payload, si vienen dos hops con el mismo
  // (fromZone, toZone) el constraint @@unique fallaría con P2002. Es
  // un error de cliente (ramificación con doble edge) — devolvemos
  // 400 antes de tocar la BD para que la UI pueda señalarlo.
  const seen = new Set<string>();
  for (const h of parsed.data.hops) {
    const key = `${h.fromZone}->${h.toZone}`;
    if (seen.has(key)) {
      return apiError("VALIDATION_ERROR", 400, `Edge duplicado dentro de la ruta: ${h.fromZone} → ${h.toZone}`);
    }
    seen.add(key);
  }

  let route;
  try {
    route = await prisma.route.create({
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
  } catch (err: unknown) {
    // Caso muy raro post-pre-check: algún hop colisiona con un
    // tombstone soft-deleted en _otra_ ruta (no es posible — el
    // constraint es per-route — pero blindamos por si acaso).
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      return apiError("CONFLICT", 409, "Conflicto al crear la ruta: edge duplicado.");
    }
    throw err;
  }

  await logAudit(clanId, session.user.id, "ROUTE_CREATE", route.id, { hopCount: parsed.data.hops.length });

  return NextResponse.json(route, { status: 201 });
}
