import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const clanId = url.searchParams.get("clanId");
  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (clanId) where.clanId = clanId;

  const routes = await prisma.route.findMany({
    where,
    include: {
      clan: { select: { id: true, name: true } },
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
    },
  });
  return NextResponse.json(routes);
}
