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
  const q = url.searchParams.get("q") ?? "";
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ discordUsername: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : undefined,
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}
