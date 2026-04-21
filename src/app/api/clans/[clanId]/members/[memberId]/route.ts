import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const patchSchema = z.object({
  displayName: z.string().min(1).max(40).nullable(),
});

type RouteParams = { params: Promise<{ clanId: string; memberId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, memberId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const memberIdInt = Number(memberId);
  if (!Number.isInteger(memberIdInt)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const member = await prisma.clanMember.findFirst({ where: { id: memberIdInt, clanId } });
  if (!member) return apiError("NOT_FOUND", 404, "Miembro no encontrado");

  await prisma.user.update({ where: { id: member.userId }, data: { displayName: parsed.data.displayName } });
  return NextResponse.json({ ok: true });
}
