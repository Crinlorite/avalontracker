import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { parseIfMatch, VersionMismatchError } from "@/lib/version-check";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const patchLim = createLimiter({ windowMs: 60_000, max: 60 });

const patchSchema = z.object({
  notes: z.string().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
}).strict();

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: {
      // Solo hops vivos: los soft-deleted no son parte funcional de la
      // ruta hasta que se restauren o se hard-deleteen tras 7 días.
      hops: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { fromZone: true, toZone: true },
      },
    },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");
  return NextResponse.json(route);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const wantsDisable = parsed.data.status === "DISABLED";
  const minRole = wantsDisable ? "CONTRIBUTOR" : "CONTRIBUTOR";
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, minRole, "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(patchLim, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas actualizaciones", { retryAfterMs: rl.retryAfterMs });

  const current = await prisma.route.findFirst({ where: { id: routeId, clanId } });
  if (!current) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  const ifMatch = parseIfMatch(request.headers.get("if-match"));
  if (ifMatch !== null && ifMatch !== current.version) {
    return apiError("CONFLICT", 409, "Alguien ya editó esta ruta; recarga", { currentVersion: current.version });
  }

  try {
    const updated = await prisma.route.update({
      where: { id: routeId },
      data: {
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
        status: parsed.data.status,
        disabledAt: wantsDisable ? new Date() : null,
        disabledById: wantsDisable ? session.user.id : null,
        version: { increment: 1 },
      },
    });
    await logAudit(clanId, session.user.id, wantsDisable ? "ROUTE_DISABLE" : "ROUTE_UPDATE", routeId, parsed.data as Record<string, unknown>);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof VersionMismatchError) return apiError("CONFLICT", 409, "version mismatch", { currentVersion: err.currentVersion });
    return internalError(err);
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  // Si el cliente pasa ?hops=ID1,ID2,... borramos solo esos hops (path
  // partial delete). Si no, comportamiento clásico: borrar la Route
  // entera (cascadea los hops). El uso típico del partial delete es
  // cuando la fila de la lista representa solo UN camino (path-route)
  // de una Route con bifurcaciones — borrar la Route entera mataría
  // también a los hermanos, que el usuario no espera.
  const url = new URL(req.url);
  const hopsParam = url.searchParams.get("hops");
  let hopIdsToDelete: number[] | null = null;
  if (hopsParam) {
    hopIdsToDelete = hopsParam
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (hopIdsToDelete.length === 0) {
      return apiError("VALIDATION_ERROR", 400, "hops query param inválido");
    }
  }

  // Soft-delete: solo marcamos hops con deletedAt = now(). El barrido
  // lazy de GET hace hard-delete después de 7 días. Esto da una
  // ventana de recuperación para revertir borrados accidentales —
  // basta con poner deletedAt = null para los hops afectados.
  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: { hops: { where: { deletedAt: null } } },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  const now = new Date();
  let targetHopIds: number[];
  let action: "ROUTE_DELETE" | "ROUTE_HOPS_DELETE";

  if (hopIdsToDelete) {
    const ownedHopIds = new Set(route.hops.map((h) => h.id));
    targetHopIds = hopIdsToDelete.filter((id) => ownedHopIds.has(id));
    if (targetHopIds.length === 0) {
      return apiError("VALIDATION_ERROR", 400, "Ningún hopId pertenece a la ruta");
    }
    // Si vamos a "vaciar" la route (todos los hops vivos pasan a
    // soft-deleted) la marcamos con la acción de Route entera para
    // que la audit log lo refleje.
    const willEmptyRoute = targetHopIds.length === route.hops.length;
    action = willEmptyRoute ? "ROUTE_DELETE" : "ROUTE_HOPS_DELETE";
  } else {
    targetHopIds = route.hops.map((h) => h.id);
    action = "ROUTE_DELETE";
  }

  await prisma.routeHop.updateMany({
    where: { id: { in: targetHopIds }, deletedAt: null },
    data: { deletedAt: now },
  });
  await prisma.route.update({
    where: { id: routeId },
    data: { version: { increment: 1 } },
  });
  await logAudit(clanId, session.user.id, action, routeId, {
    hopIds: targetHopIds,
    softDeletedAt: now.toISOString(),
    recoverableUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  return new NextResponse(null, { status: 204 });
}
