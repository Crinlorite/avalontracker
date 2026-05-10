import type { AppRole } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

export class BotUnavailableError extends Error {
  public code = "VIGIL_BOT_UNAVAILABLE" as const;
  constructor(public cause: unknown) {
    super("Vigil Bot unreachable");
  }
}

// Permanente: el bot vive y autentica, pero no es miembro del Discord
// guild que el clan tiene registrado. Distinto de BotUnavailableError —
// no se arregla esperando, hay que invitar el bot al servidor.
export class BotNotInGuildError extends Error {
  public code = "VIGIL_BOT_NOT_IN_GUILD" as const;
  constructor() {
    super("Vigil Bot is not a member of the Discord guild");
  }
}

type UserRoleResponse = {
  discordRoleIds: string[];
  computedAppRole: AppRole | null;
};

type GuildRole = {
  id: string;
  name: string;
  color: number;
  position: number;
};

function botUrl(): string {
  const url = process.env.VIGIL_BOT_API_URL;
  if (!url) throw new BotUnavailableError(new Error("VIGIL_BOT_API_URL not set"));
  return url;
}

function authHeaders(): Record<string, string> {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret)
    throw new BotUnavailableError(new Error("VIGIL_BOT_SHARED_SECRET not set"));
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

const DEFAULT_TIMEOUT_MS = 2000;

async function botFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${botUrl()}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (res.status === 404) {
      throw new BotNotInGuildError();
    }
    if (!res.ok) {
      throw new BotUnavailableError(new Error(`HTTP ${res.status}`));
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof BotNotInGuildError) throw err;
    if (err instanceof BotUnavailableError) throw err;
    logger.warn({ err, path }, "vigil bot call failed");
    throw new BotUnavailableError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUserRoleFromBot(
  guildId: string,
  discordId: string
): Promise<UserRoleResponse> {
  return botFetch<UserRoleResponse>(
    `/guilds/${encodeURIComponent(guildId)}/member/${encodeURIComponent(discordId)}/roles`
  );
}

export async function fetchGuildRoles(guildId: string): Promise<GuildRole[]> {
  return botFetch<GuildRole[]>(`/guilds/${encodeURIComponent(guildId)}/roles`);
}

export async function fetchGuildHealth(
  guildId: string
): Promise<{ installed: boolean; gatewayConnected?: boolean }> {
  try {
    return await botFetch<{ installed: boolean; gatewayConnected: boolean }>(
      `/guilds/${encodeURIComponent(guildId)}/health`
    );
  } catch {
    return { installed: false };
  }
}

export async function fetchUserClans(
  discordId: string
): Promise<
  Array<{
    guildId: string;
    discordRoleIds: string[];
    computedAppRole: AppRole | null;
  }>
> {
  return botFetch(`/users/${encodeURIComponent(discordId)}/clans`);
}

export async function postGuildMessage(
  guildId: string,
  channelId: string,
  payload: { content?: string; embed?: unknown }
): Promise<void> {
  await botFetch(`/guilds/${encodeURIComponent(guildId)}/message`, {
    method: "POST",
    body: JSON.stringify({ channelId, ...payload }),
  });
}

export type MemberDetail = {
  nickname: string | null;
  avatar: string | null;            // hash Discord crudo, ej "a_abc123"
  joinedAt: string;                 // ISO-8601
  discordRoleIds: string[];
  computedAppRole: AppRole | null;
};

export async function fetchMember(
  guildId: string,
  discordId: string
): Promise<MemberDetail> {
  return botFetch<MemberDetail>(
    `/guilds/${encodeURIComponent(guildId)}/member/${encodeURIComponent(discordId)}`
  );
}

export type GuildPermissions = {
  isOwner: boolean;
  hasAdministrator: boolean;
  hasManageGuild: boolean;
  canRegisterClan: boolean;
};

export class GuildOrMemberNotFoundError extends Error {
  public code = "VIGIL_NOT_FOUND" as const;
  constructor(message: string) { super(message); }
}

// Como botFetch lanza BotUnavailableError en cualquier non-OK, hacemos un
// fetch directo aquí para distinguir 404 (guild/member no existe — input
// del user incorrecto) del resto (5xx — bot caído, fail-closed arriba).
export async function fetchUserGuildPermissions(
  guildId: string,
  discordId: string,
): Promise<GuildPermissions> {
  const url = `${botUrl()}/guilds/${encodeURIComponent(guildId)}/member/${encodeURIComponent(discordId)}/permissions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: authHeaders(),
      signal: controller.signal,
    });
    if (res.status === 404) {
      throw new GuildOrMemberNotFoundError("Guild o miembro no encontrado");
    }
    if (!res.ok) {
      throw new BotUnavailableError(new Error(`HTTP ${res.status}`));
    }
    return (await res.json()) as GuildPermissions;
  } catch (err) {
    if (err instanceof GuildOrMemberNotFoundError) throw err;
    if (err instanceof BotUnavailableError) throw err;
    logger.warn({ err, guildId, discordId: discordId.slice(0, 4) + "..." }, "vigil bot permissions check failed");
    throw new BotUnavailableError(err);
  } finally {
    clearTimeout(timer);
  }
}
