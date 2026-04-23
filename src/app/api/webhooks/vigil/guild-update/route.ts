import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/hmac";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { createLimiter, consumeToken } from "@/lib/rate-limit";
import { verifyWebhookFreshness } from "@/lib/webhook-freshness";

const schema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  newName: z.string().min(1).max(100).optional(),
  // Hash de Discord (32 hex, opcionalmente con prefix "a_" para animados).
  newIcon: z.string().regex(/^(a_)?[a-f0-9]{32}$/).nullable().optional(),
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
    await prisma.clan.updateMany({
      where: { discordGuildId: data.guildId },
      data: {
        discordGuildName: data.newName ?? undefined,
        discordGuildIcon: data.newIcon === undefined ? undefined : data.newIcon,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
