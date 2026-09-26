import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const u = await prisma.user.findUnique({ where: { id: me.userId }, select: { id: true, isGuest: true, displayName: true, globalNickname: true, discordUsername: true } });
  if (!u) return apiError("UNAUTHORIZED", 401, "Sesión inválida");
  return NextResponse.json({ id: u.id, isGuest: u.isGuest, name: u.isGuest ? null : (u.displayName ?? u.globalNickname ?? u.discordUsername) });
}
