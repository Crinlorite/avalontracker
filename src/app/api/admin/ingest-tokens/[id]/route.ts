import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ id: string }> };

async function requireSuperAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  return u?.isSuperAdmin === true;
}

// DELETE /api/admin/ingest-tokens/:id — revoca (no borra, deja trazable cuándo se revocó).
export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  if (!(await requireSuperAdmin(session.user.id))) return apiError("INSUFFICIENT_ROLE", 403, "Sin permisos");

  const { id } = await params;
  const token = await prisma.ingestToken.findUnique({ where: { id } });
  if (!token) return apiError("NOT_FOUND", 404, "Token no encontrado");
  if (token.userId !== session.user.id) return apiError("INSUFFICIENT_ROLE", 403, "No es tu token");

  try {
    await prisma.ingestToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return internalError(err);
  }
}
