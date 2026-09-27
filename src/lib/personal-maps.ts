import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { touchGuest } from "@/lib/guest";
import { Prisma } from "@/generated/prisma/client";

export const MAX_PERSONAL_MAPS = 3;

// Mapa personal: un «clan» de una sola persona, sin Discord ni Vigil.
// Lo usan /api/maps (web) y /api/v1/maps (app). NO_USER: la sesión apunta a
// un usuario que ya no existe (cuenta borrada, invitado purgado) → 401.
export async function createPersonalMap(userId: string, anchorZone?: string): Promise<{ id: string; name: string } | { error: "LIMIT" | "NO_USER" }> {
  const owned = await prisma.clan.count({ where: { createdById: userId, kind: "PERSONAL" } });
  if (owned >= MAX_PERSONAL_MAPS) return { error: "LIMIT" };
  const anchor = anchorZone
    ? await prisma.zone.findFirst({ where: { name: { equals: anchorZone, mode: "insensitive" } }, select: { id: true } })
    : null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, globalNickname: true, discordUsername: true, isGuest: true },
  });
  if (!user) return { error: "NO_USER" };
  const who = user.isGuest ? "My" : `${(user.displayName ?? user.globalNickname ?? user.discordUsername).slice(0, 20)}'s`;

  // El nombre de clan es único en toda la app: sufijo aleatorio corto.
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = `${who} map · ${crypto.randomBytes(3).toString("hex")}`;
    try {
      const clan = await prisma.$transaction(async (tx) => {
        const created = await tx.clan.create({ data: { name, kind: "PERSONAL", createdById: userId, anchorZoneId: anchor?.id ?? null } });
        await tx.clanMember.create({ data: { userId, clanId: created.id, appRole: "ADMIN", roleSource: "personal:owner", lastSyncAt: new Date() } });
        await logAudit(created.id, userId, "CLAN_CREATE", undefined, { name, kind: "PERSONAL" }, tx);
        return created;
      });
      await touchGuest(userId);
      return { id: clan.id, name: clan.name };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("No se pudo generar un nombre libre");
}
