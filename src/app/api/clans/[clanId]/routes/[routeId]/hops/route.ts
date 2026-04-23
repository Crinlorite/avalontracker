import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

const hopLimiter = createLimiter({ windowMs: 60_000, max: 30 });

const appendSchema = z.object({
  fromZone: z.string().min(1),
  toZone: z.string().min(1),
  portalSize: z.union([z.literal(7), z.literal(20), z.literal(40)]),
  expiresAt: z.string().datetime(),
  allowBrokenChain: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

// POST /api/clans/:clanId/routes/:routeId/hops — añadir hop al final de la cadena.
export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(hopLimiter, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const parsed = appendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  }

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: { hops: { orderBy: { order: "desc" }, take: 1 } },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");
  if (route.hops.length >= 50) return apiError("VALIDATION_ERROR", 400, "Una ruta no puede tener más de 50 hops");

  // Validar que fromZone es ya un nodo del grafo (fromZone o toZone en alguna
  // hop de esta ruta) — permite ramificar libremente desde cualquier zona
  // visitada. Si la ruta está vacía, cualquier fromZone vale (primer hop).
  // allowBrokenChain escapa el check si quieres conectar grafos disjoints.
  const lastHop = route.hops[0];
  if (lastHop && !parsed.data.allowBrokenChain) {
    const fromInGraph = await prisma.routeHop.findFirst({
      where: {
        routeId,
        OR: [
          { fromZone: { name: parsed.data.fromZone } },
          { toZone: { name: parsed.data.fromZone } },
        ],
      },
      select: { id: true },
    });
    if (!fromInGraph) {
      return apiError(
        "VALIDATION_ERROR",
        400,
        `"${parsed.data.fromZone}" no está en el grafo de esta ruta. Para conectar desde fuera usa allowBrokenChain=true.`,
      );
    }
  }

  // Resolver zone IDs
  const [fromZoneRow, toZoneRow] = await Promise.all([
    prisma.zone.findUnique({ where: { name: parsed.data.fromZone }, select: { id: true } }),
    prisma.zone.findUnique({ where: { name: parsed.data.toZone }, select: { id: true } }),
  ]);
  if (!fromZoneRow) return apiError("VALIDATION_ERROR", 400, `Zona desconocida: ${parsed.data.fromZone}`);
  if (!toZoneRow) return apiError("VALIDATION_ERROR", 400, `Zona desconocida: ${parsed.data.toZone}`);

  const nextOrder = lastHop ? lastHop.order + 1 : 0;

  const hop = await prisma.routeHop.create({
    data: {
      routeId,
      order: nextOrder,
      fromZoneId: fromZoneRow.id,
      toZoneId: toZoneRow.id,
      portalSize: parsed.data.portalSize,
      expiresAt: new Date(parsed.data.expiresAt),
    },
    include: { fromZone: true, toZone: true },
  });

  // Bump version para optimistic concurrency, resucitar si estaba EXPIRED.
  await prisma.route.update({
    where: { id: routeId },
    data: {
      version: { increment: 1 },
      status: route.status === "EXPIRED" ? "ACTIVE" : route.status,
    },
  });

  await logAudit(clanId, session.user.id, "ROUTE_UPDATE", String(hop.id), {
    appendedHop: { from: parsed.data.fromZone, to: parsed.data.toZone, portalSize: parsed.data.portalSize },
  });

  return NextResponse.json(hop, { status: 201 });
}
