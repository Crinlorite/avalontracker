import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth } from "@/lib/vigil-bot-client";
import { apiError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

// 60/min per IP — cubre sobradamente al Docker HEALTHCHECK (cada 30s)
// y cualquier monitor externo razonable, pero rechaza enumeración o
// scrapeo agresivo. Sin uptime en el body para no exponer la ventana
// de "recién desplegado" a un atacante que esté esperando una
// vulnerabilidad recién parcheada.
const healthLim = createLimiter({ windowMs: 60_000, max: 60 });

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const rl = consumeToken(healthLim, ip);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  let botOk = false;
  try {
    const guild = await prisma.clan.findFirst({ where: { discordGuildId: { not: null } }, select: { discordGuildId: true } });
    if (guild) {
      const h = await fetchGuildHealth(guild.discordGuildId!);
      botOk = h.installed;
    } else {
      botOk = true;
    }
  } catch { botOk = false; }
  return NextResponse.json({
    db: dbOk,
    vigilBot: botOk,
  }, { status: dbOk ? 200 : 503 });
}
