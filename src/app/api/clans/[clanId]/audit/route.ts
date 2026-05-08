// src/app/api/clans/[clanId]/audit/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRole(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { clanId },
      include: { user: { select: { id: true, discordUsername: true, displayName: true, globalNickname: true } } },
      orderBy: { createdAt: "desc" },
      skip, take: limit,
    }),
    prisma.auditLog.count({ where: { clanId } }),
  ]);

  return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

// DELETE /api/clans/:clanId/audit?id=N — borra una entrada concreta.
// Restringido a ADMIN del clan (pensado para corregir errores propios).
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRole(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return apiError("VALIDATION_ERROR", 400, "Falta parámetro id");

  const idInt = Number(id);
  if (!Number.isInteger(idInt)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const entry = await prisma.auditLog.findFirst({ where: { id: idInt, clanId } });
  if (!entry) return apiError("NOT_FOUND", 404, "Entrada no encontrada");

  await prisma.auditLog.delete({ where: { id: idInt } });
  return NextResponse.json({ deleted: 1 });
}
