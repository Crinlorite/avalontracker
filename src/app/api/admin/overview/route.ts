import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const [clans, activeRoutes, usersActive24h, expiringSoon] = await Promise.all([
    prisma.clan.count(),
    prisma.route.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { updatedAt: { gte: yesterday } } }),
    prisma.routeHop.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * 60 * 1000) },
      },
    }),
  ]);
  return NextResponse.json({ clans, activeRoutes, usersActive24h, expiringSoon });
}
