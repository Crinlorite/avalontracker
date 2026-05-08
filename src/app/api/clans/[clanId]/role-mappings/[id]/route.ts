import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError, invalidateRoleCache } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ clanId: string; id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, id } = await params;
  try {
    await requireRole(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const mappingId = Number(id);
  if (!Number.isInteger(mappingId)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const mapping = await prisma.clanRoleMapping.findFirst({ where: { id: mappingId, clanId } });
  if (!mapping) return apiError("NOT_FOUND", 404, "Mapping no encontrado");

  await prisma.clanRoleMapping.delete({ where: { id: mappingId } });

  await logAudit(clanId, session.user.id, "ROLE_MAPPING_CHANGE", undefined, { deleted: mapping.discordRoleId });

  const members = await prisma.clanMember.findMany({ where: { clanId }, select: { userId: true } });
  for (const m of members) invalidateRoleCache(m.userId, clanId);

  return new NextResponse(null, { status: 204 });
}
