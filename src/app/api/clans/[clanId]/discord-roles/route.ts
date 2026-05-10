import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { fetchGuildRoles, BotUnavailableError } from "@/lib/vigil-bot-client";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRole(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }

  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { discordGuildId: true } });
  if (!clan) return apiError("NOT_FOUND", 404, "Clan no encontrado");

  try {
    const roles = await fetchGuildRoles(clan.discordGuildId);
    return NextResponse.json(roles);
  } catch (e) {
    if (e instanceof BotUnavailableError) {
      return apiError("STALE_DEPENDENCY", 503, "Vigil Bot no responde");
    }
    return internalError(e);
  }
}
