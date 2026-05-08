import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";

function verifyBearer(req: Request): boolean {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;
  const received = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

type RouteParams = { params: Promise<{ guildId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  if (!verifyBearer(request)) return apiError("UNAUTHORIZED", 401, "Bearer inválido");
  const { guildId } = await params;

  try {
    const clan = await prisma.clan.findUnique({
      where: { discordGuildId: guildId },
      select: {
        id: true,
        roleMappings: { select: { discordRoleId: true, appRole: true } },
      },
    });
    if (!clan) return apiError("NOT_FOUND", 404, "clan no existe");
    return NextResponse.json({
      clanId: clan.id,
      guildId,
      mappings: clan.roleMappings,
    });
  } catch (e) {
    return internalError(e);
  }
}
