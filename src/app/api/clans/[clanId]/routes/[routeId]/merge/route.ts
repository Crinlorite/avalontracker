import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const mergeSchema = z.object({
  sourceRouteId: z.string().min(1),
  position: z.enum(["append", "prepend"]).optional().default("append"),
  allowBrokenChain: z.boolean().optional().default(false),
});

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

// POST /api/clans/:clanId/routes/:routeId/merge
// Fusiona sourceRouteId dentro de :routeId:
//   - append (default): los hops del source se añaden al final de los de target.
//   - prepend: los hops del source se insertan al principio.
// Tras la fusión, se borra la ruta source (cascade borra sus hops).
// Si los extremos no encajan (cadena rota), requiere allowBrokenChain=true.
export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  if (parsed.data.sourceRouteId === routeId) {
    return apiError("VALIDATION_ERROR", 400, "No puedes fusionar una ruta consigo misma");
  }

  const [target, source] = await Promise.all([
    prisma.route.findFirst({
      where: { id: routeId, clanId },
      include: { hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
    }),
    prisma.route.findFirst({
      where: { id: parsed.data.sourceRouteId, clanId },
      include: { hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
    }),
  ]);
  if (!target) return apiError("NOT_FOUND", 404, "Ruta destino no encontrada");
  if (!source) return apiError("NOT_FOUND", 404, "Ruta origen no encontrada");

  const totalHops = target.hops.length + source.hops.length;
  if (totalHops > 12) {
    return apiError("VALIDATION_ERROR", 400, `La fusión tendría ${totalHops} hops, máximo permitido es 12`);
  }

  // Check de continuidad según position.
  if (parsed.data.position === "append") {
    const lastTarget = target.hops[target.hops.length - 1];
    const firstSource = source.hops[0];
    if (lastTarget && firstSource && lastTarget.toZone.name !== firstSource.fromZone.name && !parsed.data.allowBrokenChain) {
      return apiError(
        "VALIDATION_ERROR",
        400,
        `Cadena no continua: la ruta destino termina en "${lastTarget.toZone.name}" y la origen empieza en "${firstSource.fromZone.name}". Envía allowBrokenChain=true para forzar.`
      );
    }
  } else {
    // prepend: source va delante. Último hop de source debe conectar con primero de target.
    const lastSource = source.hops[source.hops.length - 1];
    const firstTarget = target.hops[0];
    if (lastSource && firstTarget && lastSource.toZone.name !== firstTarget.fromZone.name && !parsed.data.allowBrokenChain) {
      return apiError(
        "VALIDATION_ERROR",
        400,
        `Cadena no continua: la ruta origen termina en "${lastSource.toZone.name}" y la destino empieza en "${firstTarget.fromZone.name}". Envía allowBrokenChain=true para forzar.`
      );
    }
  }

  const sourceHopIds = source.hops.map((h) => h.id);

  // Renumeración de órdenes.
  let orderOps: Array<Promise<unknown>>;
  if (parsed.data.position === "append") {
    const baseOrder = target.hops.length;
    orderOps = source.hops.map((h, idx) =>
      prisma.routeHop.update({
        where: { id: h.id },
        data: { routeId: target.id, order: baseOrder + idx },
      })
    );
  } else {
    // prepend: primero desplazamos target.hops hacia abajo por sourceCount,
    // luego insertamos source delante.
    const sourceCount = source.hops.length;
    const targetShift = target.hops.map((h) =>
      prisma.routeHop.update({
        where: { id: h.id },
        data: { order: h.order + sourceCount },
      })
    );
    const sourceMove = source.hops.map((h, idx) =>
      prisma.routeHop.update({
        where: { id: h.id },
        data: { routeId: target.id, order: idx },
      })
    );
    orderOps = [...targetShift, ...sourceMove];
  }

  try {
    await prisma.$transaction([
      ...orderOps,
      // Borra la ruta source (sus hops ya fueron reasignados, no hay cascade peligroso).
      prisma.route.delete({ where: { id: source.id } }),
      prisma.route.update({
        where: { id: target.id },
        data: {
          version: { increment: 1 },
          status: target.status === "EXPIRED" || source.status === "EXPIRED" ? target.status : "ACTIVE",
        },
      }),
      prisma.auditLog.create({
        data: {
          clanId,
          userId: session.user.id,
          targetId: target.id,
          action: "ROUTE_UPDATE",
          details: {
            merged: {
              sourceRouteId: source.id,
              sourceHopIds,
              position: parsed.data.position,
              resultingHops: totalHops,
            },
          },
        },
      }),
    ]);
  } catch (err) {
    return internalError(err);
  }

  const merged = await prisma.route.findUnique({
    where: { id: target.id },
    include: { hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
  });
  return NextResponse.json(merged);
}
