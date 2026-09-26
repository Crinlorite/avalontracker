import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage, invalidateClanRoleCache } from "@/lib/permissions";
import { checkGuildRegistration } from "@/lib/clan-register";
import { logAudit } from "@/lib/audit";
import { revokeAllShares } from "@/lib/map-shares";
import { Prisma } from "@/generated/prisma/client";

// Convierte un mapa personal en mapa de clan ligado a un servidor de
// Discord. Mismo id, mismas rutas; a partir de aquí los roles salen de
// Vigil Bot como en cualquier clan. Mismos requisitos que crear un clan.
const schema = z.object({
  name: z.string().min(3).max(40),
  discordGuildId: z.string().regex(/^\d{17,20}$/),
  discordGuildName: z.string().min(1).max(100),
  discordGuildIcon: z.string().nullable().optional(),
}).strict();

type RouteParams = { params: Promise<{ clanId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const userId = session.user.id;
  const { clanId } = await params;

  try {
    await requireRole(userId, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  try {
    const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { kind: true, createdById: true } });
    if (!clan) return apiError("NOT_FOUND", 404, "Mapa no encontrado");
    if (clan.kind !== "PERSONAL") return apiError("CONFLICT", 409, "Este mapa ya es de un clan");
    // Solo el dueño del mapa (no un ADMIN añadido a mano).
    if (clan.createdById !== userId) return apiError("INSUFFICIENT_ROLE", 403, "Solo quien creó el mapa puede convertirlo");

    const check = await checkGuildRegistration(userId, parsed.data.discordGuildId, parsed.data.name, clanId);
    if (!check.ok) return apiError(check.code, check.status, check.message, check.extra);

    // Los enlaces compartidos y sus miembros dejan de valer: los roles pasan a Discord.
    await revokeAllShares(clanId);

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.clan.update({
        where: { id: clanId, kind: "PERSONAL" },
        data: {
          kind: "DISCORD",
          name: parsed.data.name,
          discordGuildId: parsed.data.discordGuildId,
          discordGuildName: parsed.data.discordGuildName,
          discordGuildIcon: parsed.data.discordGuildIcon ?? null,
          botInstalled: true,
        },
      });
      await tx.clanMember.update({
        where: { userId_clanId: { userId, clanId } },
        data: { appRole: "ADMIN", roleSource: "creator:permanent", lastSyncAt: new Date() },
      });
      await logAudit(clanId, userId, "MAP_CONVERTED_TO_CLAN", undefined, { name: c.name, guildId: c.discordGuildId }, tx);
      return c;
    });
    invalidateClanRoleCache(clanId);
    return NextResponse.json({ id: updated.id, name: updated.name, kind: updated.kind });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError("VALIDATION_ERROR", 400, "Ese servidor o ese nombre ya están cogidos");
    }
    return internalError(err);
  }
}
