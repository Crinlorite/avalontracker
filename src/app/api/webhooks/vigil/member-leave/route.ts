import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/hmac";
import { prisma } from "@/lib/prisma";
import { invalidateRoleCache } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { createLimiter, consumeToken } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  discordId: z.string().regex(/^\d{17,20}$/),
});

const webhookLimiter = createLimiter({ windowMs: 60_000, max: 100 });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = consumeToken(webhookLimiter, ip);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) return apiError("INTERNAL", 500, "Secret no configurado");

  const signature = request.headers.get("x-vigil-signature") ?? "";
  const body = await request.text();
  if (!verifySignature(body, signature, secret)) return apiError("UNAUTHORIZED", 401, "Firma inválida");

  try {
    const data = schema.parse(JSON.parse(body));
    const user = await prisma.user.findUnique({ where: { discordId: data.discordId } });
    const clan = await prisma.clan.findUnique({ where: { discordGuildId: data.guildId } });
    if (!user || !clan) return NextResponse.json({ ignored: true });

    await prisma.clanMember.updateMany({
      where: { userId: user.id, clanId: clan.id },
      data: { appRole: null, lastSyncAt: new Date() },
    });
    invalidateRoleCache(user.id, clan.id);

    await logAudit(clan.id, user.id, "MEMBER_LEFT");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
