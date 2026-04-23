import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/hmac";
import { prisma } from "@/lib/prisma";
import { invalidateRoleCache, getUserRoleInClan } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { createLimiter, consumeToken } from "@/lib/rate-limit";
import { verifyWebhookFreshness } from "@/lib/webhook-freshness";

const schema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  discordId: z.string().regex(/^\d{17,20}$/),
  newRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(250),
  oldRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(250),
  timestamp: z.string().datetime().optional(),
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
    const fresh = verifyWebhookFreshness(data);
    if (!fresh.ok) return apiError("UNAUTHORIZED", 401, `Replay attack rejected: ${fresh.reason}`);
    const user = await prisma.user.findUnique({ where: { discordId: data.discordId } });
    const clan = await prisma.clan.findUnique({ where: { discordGuildId: data.guildId } });
    if (!user || !clan) return NextResponse.json({ ignored: true });

    invalidateRoleCache(user.id, clan.id);
    await getUserRoleInClan(user.id, clan.id);
    logger.info({ userId: user.id, clanId: clan.id }, "role synced via webhook");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
