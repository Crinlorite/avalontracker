import { prisma } from "@/lib/prisma";
import { fetchGuildHealth, fetchUserGuildPermissions, GuildOrMemberNotFoundError, BotUnavailableError } from "@/lib/vigil-bot-client";

export type RegisterCheck =
  | { ok: true }
  | { ok: false; code: "UNAUTHORIZED" | "VALIDATION_ERROR" | "INSUFFICIENT_ROLE" | "STALE_DEPENDENCY"; status: number; message: string; extra?: Record<string, unknown> };

// Comprobaciones para ligar un clan a un servidor de Discord, tanto al
// crearlo como al convertir un mapa personal:
//   1. Vigil Bot instalado en el servidor.
//   2. Quien lo pide es owner / Administrator / Manage Guild (sin bypass).
//   3. Ni el servidor ni el nombre están ya cogidos (salvo por `exceptClanId`).
// Falla cerrado si no se puede verificar con el bot.
export async function checkGuildRegistration(
  userId: string,
  guildId: string,
  name: string,
  exceptClanId?: string,
): Promise<RegisterCheck> {
  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, isGuest: true } });
  if (!requester?.discordId || requester.isGuest) {
    return { ok: false, code: "UNAUTHORIZED", status: 401, message: "Entra con Discord para ligar un servidor" };
  }

  const health = await fetchGuildHealth(guildId);
  if (!health.installed) {
    return { ok: false, code: "VALIDATION_ERROR", status: 400, message: "Vigil Bot no está instalado en este guild. Instálalo antes de crear el clan." };
  }

  try {
    const perms = await fetchUserGuildPermissions(guildId, requester.discordId);
    if (!perms.canRegisterClan) {
      return { ok: false, code: "INSUFFICIENT_ROLE", status: 403, message: "No tienes permisos en ese servidor Discord (necesitas ser owner, administrator o manage guild)." };
    }
  } catch (err) {
    if (err instanceof GuildOrMemberNotFoundError) {
      return { ok: false, code: "VALIDATION_ERROR", status: 400, message: "No eres miembro de ese servidor Discord, o el bot no lo ve." };
    }
    if (err instanceof BotUnavailableError) {
      return { ok: false, code: "STALE_DEPENDENCY", status: 503, message: "No se pudo verificar permisos Discord ahora mismo. Reintenta en un momento." };
    }
    throw err;
  }

  const existing = await prisma.clan.findFirst({
    where: {
      OR: [{ discordGuildId: guildId }, { name }],
      ...(exceptClanId ? { NOT: { id: exceptClanId } } : {}),
    },
    select: { id: true, discordGuildId: true },
  });
  if (existing) {
    const message = existing.discordGuildId === guildId ? "Este guild Discord ya tiene un clan registrado." : "Ya existe un clan con ese nombre.";
    return { ok: false, code: "VALIDATION_ERROR", status: 400, message, extra: { existingClanId: existing.id } };
  }
  return { ok: true };
}
