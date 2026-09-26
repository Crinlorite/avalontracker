import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkGuildRegistration } from "@/lib/clan-register";
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
      kind: c.kind,
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

    const check = await checkGuildRegistration(session.user.id, parsed.data.discordGuildId, parsed.data.name);
    if (!check.ok) return apiError(check.code, check.status, check.message, check.extra);

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
