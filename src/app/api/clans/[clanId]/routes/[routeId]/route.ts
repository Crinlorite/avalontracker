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
    include: { hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
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

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: { hops: true },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  if (hopIdsToDelete) {
    // Validar que los hopIds pertenecen a esta route — no se permite
    // borrar hops de OTRA route con esta ruta de DELETE.
    const ownedHopIds = new Set(route.hops.map((h) => h.id));
    const validIds = hopIdsToDelete.filter((id) => ownedHopIds.has(id));
    if (validIds.length === 0) {
      return apiError("VALIDATION_ERROR", 400, "Ningún hopId pertenece a la ruta");
    }

    const willRemainCount = route.hops.length - validIds.length;
    if (willRemainCount <= 0) {
      // Si vamos a vaciar la route, borramos la route completa (los
      // hops cascadean). Equivalente a no haber pasado hops.
      await prisma.route.delete({ where: { id: routeId } });
      await logAudit(clanId, session.user.id, "ROUTE_DELETE", routeId);
    } else {
      // Borrado parcial: solo los hops elegidos. Bumpeamos version
      // para que el optimistic-concurrency control no se quede atrás.
      await prisma.routeHop.deleteMany({ where: { id: { in: validIds } } });
      await prisma.route.update({
        where: { id: routeId },
        data: { version: { increment: 1 } },
      });
      await logAudit(clanId, session.user.id, "ROUTE_HOPS_DELETE", routeId, {
        hopIds: validIds,
        remaining: willRemainCount,
      });
    }
  } else {
    await prisma.route.delete({ where: { id: routeId } });
    await logAudit(clanId, session.user.id, "ROUTE_DELETE", routeId);
  }

  return new NextResponse(null, { status: 204 });
}
