import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  // Stealth super admin: un user con isSuperAdmin=true nunca aparece
  // en el listado de miembros cuando lo consulta un no-super-admin.
  // Solo él mismo (o otro super admin) lo ve en la lista.
  const requester = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });
  const hideSuperAdmins = !requester?.isSuperAdmin;

  const members = await prisma.clanMember.findMany({
    where: {
      clanId,
      ...(hideSuperAdmins ? { user: { isSuperAdmin: false } } : {}),
    },
    include: {
      user: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true, discordId: true } },
    },
    orderBy: [{ appRole: "desc" }, { joinedAt: "asc" }],
    take: 500,
  });

  return NextResponse.json(members);
}
