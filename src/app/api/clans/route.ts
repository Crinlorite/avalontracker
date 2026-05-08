import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth, fetchUserGuildPermissions, GuildOrMemberNotFoundError, BotUnavailableError } from "@/lib/vigil-bot-client";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
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

    // Verificación de permisos Discord: el user solo puede registrar el clan
    // si en ese guild es owner o tiene ADMINISTRATOR / MANAGE_GUILD.
    // Cierra el agujero de squatting de clanes ajenos. Sin bypass — RBAC puro.
    const requesterUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordId: true },
    });
    if (!requesterUser?.discordId) return apiError("UNAUTHORIZED", 401, "Sesión inválida");

    try {
      const perms = await fetchUserGuildPermissions(parsed.data.discordGuildId, requesterUser.discordId);
      if (!perms.canRegisterClan) {
        return apiError("INSUFFICIENT_ROLE", 403,
          "No tienes permisos en ese servidor Discord (necesitas ser owner, administrator o manage guild).");
      }
    } catch (err) {
      if (err instanceof GuildOrMemberNotFoundError) {
        return apiError("VALIDATION_ERROR", 400,
          "No eres miembro de ese servidor Discord, o el bot no lo ve.");
      }
      if (err instanceof BotUnavailableError) {
        // Fail-closed: si no podemos verificar, rechazamos.
        return apiError("STALE_DEPENDENCY", 503,
          "No se pudo verificar permisos Discord ahora mismo. Reintenta en un momento.");
      }
      throw err;
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

      await logAudit(
        created.id,
        session.user.id,
        "CLAN_CREATE",
        undefined,
        { name: created.name, guildId: created.discordGuildId, bootstrappedAs: "ADMIN" },
        tx,
      );

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
