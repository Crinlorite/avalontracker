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

  const members = await prisma.clanMember.findMany({
    where: { clanId },
    include: {
      user: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true, discordId: true } },
    },
    orderBy: [{ appRole: "desc" }, { joinedAt: "asc" }],
  });

  return NextResponse.json(members);
}
