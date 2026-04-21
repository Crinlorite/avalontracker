import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }
  const clans = await prisma.clan.findMany({
    include: {
      _count: { select: { members: true, routes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clans);
}
