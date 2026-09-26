import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { touchGuest } from "@/lib/guest";
import { Prisma } from "@/generated/prisma/client";

// Mapas personales: un «clan» de una sola persona, sin Discord ni Vigil.
// Vale para invitados y para cuentas de Discord.
export const MAX_PERSONAL_MAPS = 3;

const createSchema = z.object({
  // Zona de partida opcional (p. ej. desde /zones/<zona>): se usa de ancla.
  anchorZone: z.string().min(2).max(60).optional(),
}).strict();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const userId = session.user.id;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  try {
    const owned = await prisma.clan.count({ where: { createdById: userId, kind: "PERSONAL" } });
    if (owned >= MAX_PERSONAL_MAPS) {
      return apiError("VALIDATION_ERROR", 400, `Máximo ${MAX_PERSONAL_MAPS} mapas personales`, { limit: MAX_PERSONAL_MAPS });
    }

    const anchor = parsed.data.anchorZone
      ? await prisma.zone.findFirst({ where: { name: { equals: parsed.data.anchorZone, mode: "insensitive" } }, select: { id: true } })
      : null;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, globalNickname: true, discordUsername: true, isGuest: true } });
    if (!user) return apiError("UNAUTHORIZED", 401, "Sesión inválida");
    const who = user.isGuest ? "My" : `${(user.displayName ?? user.globalNickname ?? user.discordUsername).slice(0, 20)}'s`;

    // El nombre de clan es único en toda la app: sufijo aleatorio corto.
    for (let attempt = 0; attempt < 5; attempt++) {
      const name = `${who} map · ${crypto.randomBytes(3).toString("hex")}`;
      try {
        const clan = await prisma.$transaction(async (tx) => {
          const created = await tx.clan.create({
            data: { name, kind: "PERSONAL", createdById: userId, anchorZoneId: anchor?.id ?? null },
          });
          await tx.clanMember.create({
            data: { userId, clanId: created.id, appRole: "ADMIN", roleSource: "personal:owner", lastSyncAt: new Date() },
          });
          await logAudit(created.id, userId, "CLAN_CREATE", undefined, { name, kind: "PERSONAL" }, tx);
          return created;
        });
        await touchGuest(userId);
        return NextResponse.json({ id: clan.id, name: clan.name }, { status: 201 });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    return apiError("INTERNAL", 500, "No se pudo generar un nombre libre");
  } catch (err) {
    return internalError(err);
  }
}
