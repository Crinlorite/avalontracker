import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth } from "@/lib/vigil-bot-client";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";

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

  // NOTA: sin check de permisos Discord, cualquier user autenticado puede
  // crear un clan con el guild ID de otro server (solo hace falta que el
  // bot esté ahí). Aceptable en pre-alpha sin users reales. Cuando Vigil
  // Bot exponga /member/:discordId/permissions, añadir el check.
  // TODO: gate por isOwner || hasAdministrator || hasManageGuild.

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

    // Pre-check amigable: ya existe un clan para este guild o con este nombre
    const existing = await prisma.clan.findFirst({
      where: {
        OR: [
          { discordGuildId: parsed.data.discordGuildId },
          { name: parsed.data.name },
        ],
      },
      select: { id: true, name: true, discordGuildId: true },
    });
    if (existing) {
      const reason = existing.discordGuildId === parsed.data.discordGuildId
        ? "Este guild Discord ya tiene un clan registrado."
        : "Ya existe un clan con ese nombre.";
      return apiError("VALIDATION_ERROR", 400, reason, { existingClanId: existing.id });
    }

    // Transacción: crear clan + asignar creador como ADMIN + audit.
    // Si algún paso falla, ninguno se persiste.
    const clan = await prisma.$transaction(async (tx) => {
      const created = await tx.clan.create({
        data: {
          name: parsed.data.name,
          discordGuildId: parsed.data.discordGuildId,
          discordGuildName: parsed.data.discordGuildName,
          discordGuildIcon: parsed.data.discordGuildIcon ?? null,
          botInstalled: true,
          createdById: session.user.id,
        },
      });

      // El creador se auto-asigna como ADMIN del clan (bootstrap).
      // A partir de aquí, role mappings Discord tomarán el relevo para otros miembros.
      await tx.clanMember.create({
        data: {
          userId: session.user.id,
          clanId: created.id,
          appRole: "ADMIN",
          roleSource: "bootstrap:creator",
          lastSyncAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          clanId: created.id,
          userId: session.user.id,
          action: "CLAN_CREATE",
          details: { name: created.name, guildId: created.discordGuildId, bootstrappedAs: "ADMIN" },
        },
      });

      return created;
    });

    return NextResponse.json(clan, { status: 201 });
  } catch (err) {
    // P2002: UNIQUE constraint. Fallback si el pre-check no capturó (race condition).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "campo único";
      return apiError("VALIDATION_ERROR", 400,
        `Ya existe un clan con ese ${target}.`);
    }
    logger.error({ err }, "POST /api/clans failed");
    return internalError(err);
  }
}
