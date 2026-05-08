import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

const mergeLimiter = createLimiter({ windowMs: 60_000, max: 10 });

const mergeSchema = z.object({
  sourceRouteId: z.string().regex(/^c[a-z0-9]{20,30}$/, "ID de ruta inválido"),
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
    await requireRole(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(mergeLimiter, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  if (parsed.data.sourceRouteId === routeId) {
    return apiError("VALIDATION_ERROR", 400, "No puedes fusionar una ruta consigo misma");
  }

  const [target, source] = await Promise.all([
    prisma.route.findFirst({
      where: { id: routeId, clanId },
      include: { hops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
    }),
    prisma.route.findFirst({
      where: { id: parsed.data.sourceRouteId, clanId },
      include: { hops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
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

  // Pre-check de colisión de edges entre source y target. Si target ya
  // tiene un hop activo con (fromZoneId, toZoneId) idéntico al de algún
  // hop activo del source, reasignar la routeId del source al target
  // violaría @@unique([routeId, fromZoneId, toZoneId]) con un P2002.
  // Mejor detectarlo aquí y devolver 409 con info accionable.
  const targetEdges = new Set(target.hops.map((h) => `${h.fromZoneId}->${h.toZoneId}`));
  const collision = source.hops.find((h) => targetEdges.has(`${h.fromZoneId}->${h.toZoneId}`));
  if (collision) {
    return apiError(
      "CONFLICT",
      409,
      `La ruta destino ya tiene el edge "${collision.fromZone.name}" → "${collision.toZone.name}". Quita ese hop de una de las rutas antes de fusionar.`
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (parsed.data.position === "append") {
        const baseOrder = target.hops.length;
        for (let idx = 0; idx < source.hops.length; idx++) {
          const h = source.hops[idx];
          await tx.routeHop.update({
            where: { id: h.id },
            data: { routeId: target.id, order: baseOrder + idx },
          });
        }
      } else {
        // prepend: primero desplazamos target.hops hacia abajo por sourceCount,
        // luego insertamos source delante.
        const sourceCount = source.hops.length;
        for (const h of target.hops) {
          await tx.routeHop.update({
            where: { id: h.id },
            data: { order: h.order + sourceCount },
          });
        }
        for (let idx = 0; idx < source.hops.length; idx++) {
          const h = source.hops[idx];
          await tx.routeHop.update({
            where: { id: h.id },
            data: { routeId: target.id, order: idx },
          });
        }
      }

      // Borra la ruta source (sus hops ya fueron reasignados, no hay cascade peligroso).
      await tx.route.delete({ where: { id: source.id } });
      await tx.route.update({
        where: { id: target.id },
        data: {
          version: { increment: 1 },
          status: target.status === "EXPIRED" || source.status === "EXPIRED" ? target.status : "ACTIVE",
        },
      });
      await logAudit(clanId, session.user.id, "ROUTE_UPDATE", target.id, {
        merged: {
          sourceRouteId: source.id,
          sourceHopIds,
          position: parsed.data.position,
          resultingHops: totalHops,
        },
      }, tx);
    });
  } catch (err) {
    return internalError(err);
  }

  const merged = await prisma.route.findUnique({
    where: { id: target.id },
    include: { hops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
  });
  return NextResponse.json(merged);
}
