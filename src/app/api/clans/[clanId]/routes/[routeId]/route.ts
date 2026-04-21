import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { parseIfMatch, VersionMismatchError } from "@/lib/version-check";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

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
    await prisma.auditLog.create({
      data: {
        clanId, userId: session.user.id, targetId: routeId,
        action: wantsDisable ? "ROUTE_DISABLE" : "ROUTE_UPDATE",
        details: parsed.data as object,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof VersionMismatchError) return apiError("CONFLICT", 409, "version mismatch", { currentVersion: err.currentVersion });
    return internalError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }
  const route = await prisma.route.findFirst({ where: { id: routeId, clanId } });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  await prisma.route.delete({ where: { id: routeId } });
  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, targetId: routeId, action: "ROUTE_DELETE" },
  });
  return new NextResponse(null, { status: 204 });
}
