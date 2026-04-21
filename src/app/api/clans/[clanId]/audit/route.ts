// src/app/api/clans/[clanId]/audit/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  // Stealth super admin: si el que consulta NO es super admin, ocultamos
  // entries creados por super admins. Complementa el bypass silencioso de
  // logAudit (donde super admin no-member ya no registraba nada): aquí
  // tapamos el caso donde el super admin sí sea miembro del clan y sus
  // acciones legítimas se hayan registrado.
  const requester = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });
  const hideSuperAdmins = !requester?.isSuperAdmin;
  const whereFilter = {
    clanId,
    ...(hideSuperAdmins ? { user: { isSuperAdmin: false } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: whereFilter,
      include: { user: { select: { id: true, discordUsername: true, displayName: true, globalNickname: true } } },
      orderBy: { createdAt: "desc" },
      skip, take: limit,
    }),
    prisma.auditLog.count({ where: whereFilter }),
  ]);

  return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}
