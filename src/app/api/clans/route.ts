import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth } from "@/lib/vigil-bot-client";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(3).max(40),
  discordGuildId: z.string().regex(/^\d{17,20}$/),
  discordGuildName: z.string().min(1).max(100),
  discordGuildIcon: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: session.user.id, appRole: { not: null } } } },
    include: {
      members: { where: { userId: session.user.id }, select: { appRole: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    clans.map((c) => ({
      id: c.id,
      name: c.name,
      discordGuildName: c.discordGuildName,
      discordGuildIcon: c.discordGuildIcon,
      myRole: c.members[0]?.appRole ?? null,
      memberCount: undefined,
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", 400, "Datos inválidos", {
        issues: parsed.error.issues,
      });
    }

    const health = await fetchGuildHealth(parsed.data.discordGuildId);
    if (!health.installed) {
      return apiError("VALIDATION_ERROR", 400,
        "Vigil Bot no está instalado en este guild. Instálalo antes de crear el clan.");
    }

    const clan = await prisma.clan.create({
      data: {
        name: parsed.data.name,
        discordGuildId: parsed.data.discordGuildId,
        discordGuildName: parsed.data.discordGuildName,
        discordGuildIcon: parsed.data.discordGuildIcon ?? null,
        botInstalled: true,
        createdById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        clanId: clan.id,
        userId: session.user.id,
        action: "CLAN_CREATE",
        details: { name: clan.name, guildId: clan.discordGuildId },
      },
    });

    return NextResponse.json(clan, { status: 201 });
  } catch (err) {
    logger.error({ err }, "POST /api/clans failed");
    return internalError(err);
  }
}
