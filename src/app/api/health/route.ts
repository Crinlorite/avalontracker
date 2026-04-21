import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth } from "@/lib/vigil-bot-client";

const started = Date.now();

export async function GET() {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  let botOk = false;
  try {
    const guild = await prisma.clan.findFirst({ select: { discordGuildId: true } });
    if (guild) {
      const h = await fetchGuildHealth(guild.discordGuildId);
      botOk = h.installed;
    } else {
      botOk = true;
    }
  } catch { botOk = false; }
  return NextResponse.json({
    db: dbOk,
    vigilBot: botOk,
    uptime: Math.floor((Date.now() - started) / 1000),
  }, { status: dbOk ? 200 : 503 });
}
