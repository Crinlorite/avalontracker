import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const patchSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "COLLAPSED", "WATCHED"]).optional(),
  statusNote: z.string().max(100).nullable().optional(),
}).strict();

type RouteParams = { params: Promise<{ clanId: string; routeId: string; hopId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId, hopId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const hopIdInt = Number(hopId);
  if (!Number.isInteger(hopIdInt)) return apiError("VALIDATION_ERROR", 400, "hopId inválido");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const hop = await prisma.routeHop.findFirst({ where: { id: hopIdInt, routeId }, include: { route: true } });
  if (!hop || hop.route.clanId !== clanId) return apiError("NOT_FOUND", 404, "Hop no encontrado");

  const updated = await prisma.routeHop.update({
    where: { id: hopIdInt },
    data: {
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      status: parsed.data.status,
      statusNote: parsed.data.statusNote === undefined ? undefined : parsed.data.statusNote,
      statusSetById: parsed.data.status !== undefined ? session.user.id : undefined,
      statusSetAt: parsed.data.status !== undefined ? new Date() : undefined,
    },
  });

  await prisma.route.update({ where: { id: routeId }, data: { version: { increment: 1 } } });

  await prisma.auditLog.create({
    data: {
      clanId, userId: session.user.id, targetId: String(hopIdInt),
      action: parsed.data.status !== undefined ? "HOP_STATUS_CHANGED" : "HOP_EXTENDED",
      details: parsed.data as object,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId, hopId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const hopIdInt = Number(hopId);
  if (!Number.isInteger(hopIdInt)) return apiError("VALIDATION_ERROR", 400, "hopId inválido");

  const hop = await prisma.routeHop.findFirst({ where: { id: hopIdInt, routeId }, include: { route: true } });
  if (!hop || hop.route.clanId !== clanId) return apiError("NOT_FOUND", 404, "Hop no encontrado");

  await prisma.routeHop.delete({ where: { id: hopIdInt } });
  await prisma.route.update({ where: { id: routeId }, data: { version: { increment: 1 } } });
  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, targetId: String(hopIdInt), action: "HOP_DELETE" },
  });

  return new NextResponse(null, { status: 204 });
}
