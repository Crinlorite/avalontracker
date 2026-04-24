import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ id: string }> };

// DELETE /api/me/ingest-tokens/:id — revoca (no borra). El user solo
// puede revocar tokens que él mismo creó.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

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
