import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

function verifyBearer(req: Request): { ok: boolean; reason: string } {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) return { ok: false, reason: "no-env-secret" };
  const header = req.headers.get("authorization") ?? "";
  if (!header) return { ok: false, reason: "no-auth-header" };
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return { ok: false, reason: "wrong-scheme" };
  const received = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  if (received.length !== expected.length) {
    return { ok: false, reason: `length-mismatch(got=${received.length},want=${expected.length})` };
  }
  return crypto.timingSafeEqual(received, expected)
    ? { ok: true, reason: "ok" }
    : { ok: false, reason: "bytes-mismatch" };
}

type RouteParams = { params: Promise<{ guildId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  // Instrumentación temporal para diagnosticar 403 fantasma — el bot
  // dice "Tracker role-mappings returned 403" pero verifyBearer sólo
  // produce 401. Si llegamos a este log significa que el request alcanzó
  // el handler de Next.js. Si NO llegamos, es Traefik/CF interceptando.
  const tokenHeader = request.headers.get("authorization") ?? "";
  const v = verifyBearer(request);
  logger.info(
    {
      route: "/api/internal/role-mappings",
      method: "GET",
      authPresent: !!tokenHeader,
      bearerOk: v.ok,
      reason: v.reason,
      tokenPrefix: tokenHeader.replace(/^Bearer /, "").slice(0, 6) + "…",
      envSecretSet: !!process.env.VIGIL_BOT_SHARED_SECRET,
      envSecretPrefix: (process.env.VIGIL_BOT_SHARED_SECRET ?? "").slice(0, 6) + "…",
    },
    "role-mappings request",
  );
  if (!v.ok) return apiError("UNAUTHORIZED", 401, `Bearer inválido (${v.reason})`);
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
