import type { AppRole, ClanRoleMapping } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { LRUCache } from "lru-cache";
// Note: vigil-bot-client is loaded dynamically inside getUserRoleInClan so
// this module can be imported (e.g. for pure helpers like hasMinRole /
// resolveAppRole / ROLE_HIERARCHY) before Phase 3 creates that file. The
// type-only reference below keeps the TS signature intact.
import type { fetchUserRoleFromBot as FetchUserRoleFromBot } from "@/lib/vigil-bot-client";

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  VIEWER: 1,
  CONTRIBUTOR: 2,
  EDITOR: 3,
  ADMIN: 4,
};

export function resolveAppRole(
  userDiscordRoleIds: string[],
  mappings: Pick<ClanRoleMapping, "discordRoleId" | "appRole">[]
): AppRole | null {
  const matched = mappings
    .filter((m) => userDiscordRoleIds.includes(m.discordRoleId))
    .map((m) => m.appRole);

  if (matched.length === 0) return null;

  return matched.reduce((max, r) =>
    ROLE_HIERARCHY[r] > ROLE_HIERARCHY[max] ? r : max
  );
}

export function hasMinRole(userRole: AppRole | null, minRole: AppRole): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

type CachedRole = {
  appRole: AppRole | null;
  stale: boolean;
  syncedAt: Date;
};

const ROLE_CACHE_TTL_MS = 30 * 60 * 1000;
const roleCache = new LRUCache<string, CachedRole>({
  max: 5000,
  ttl: ROLE_CACHE_TTL_MS,
});

function cacheKey(userId: string, clanId: string): string {
  return `${userId}:${clanId}`;
}

export function invalidateRoleCache(userId: string, clanId?: string): void {
  if (clanId) {
    roleCache.delete(cacheKey(userId, clanId));
    return;
  }
  for (const key of roleCache.keys()) {
    if (key.startsWith(`${userId}:`)) roleCache.delete(key);
  }
}

export async function getUserRoleInClan(
  userId: string,
  clanId: string
): Promise<CachedRole> {
  const key = cacheKey(userId, clanId);
  const hit = roleCache.get(key);
  if (hit) return hit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true },
  });
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { discordGuildId: true, createdById: true },
  });
  if (!user || !clan) {
    const miss: CachedRole = { appRole: null, stale: false, syncedAt: new Date() };
    roleCache.set(key, miss);
    return miss;
  }

  // El creador del clan siempre es ADMIN — el bot no puede degradarlo
  // aunque sus roles Discord estén mapeados a otra cosa. Evita el caso
  // donde un master con todos los roles se demota al mapear primero
  // los roles de abajo.
  const isCreator = clan.createdById === userId;

  try {
    const { fetchUserRoleFromBot } = (await import(
      "@/lib/vigil-bot-client"
    )) as { fetchUserRoleFromBot: typeof FetchUserRoleFromBot };
    const botResult = await fetchUserRoleFromBot(clan.discordGuildId, user.discordId);

    // Si el bot devuelve computedAppRole=null (no hay mappings aplicables),
    // NO degradar un appRole existente (p.ej. bootstrap del creador que es
    // ADMIN sin Discord mapping todavía, o una asignación manual previa).
    // Solo se revoca el acceso vía webhook explícito MEMBER_LEFT.
    const existing = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { appRole: true, roleSource: true },
    });

    const nextAppRole: AppRole | null = isCreator
      ? "ADMIN"
      : (botResult.computedAppRole ?? existing?.appRole ?? null);
    const nextRoleSource = isCreator
      ? "creator:permanent"
      : botResult.computedAppRole
        ? `discord:${botResult.discordRoleIds.join(",")}`
        : (existing?.roleSource ?? null);

    const fresh: CachedRole = {
      appRole: nextAppRole,
      stale: false,
      syncedAt: new Date(),
    };
    await prisma.clanMember.upsert({
      where: { userId_clanId: { userId, clanId } },
      create: {
        userId,
        clanId,
        appRole: nextAppRole,
        roleSource: nextRoleSource,
        lastSyncAt: fresh.syncedAt,
      },
      update: {
        appRole: nextAppRole,
        roleSource: nextRoleSource,
        lastSyncAt: fresh.syncedAt,
      },
    });
    roleCache.set(key, fresh);
    return fresh;
  } catch {
    const fallback = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { appRole: true, lastSyncAt: true },
    });
    const stale: CachedRole = {
      appRole: fallback?.appRole ?? null,
      stale: true,
      syncedAt: fallback?.lastSyncAt ?? new Date(0),
    };
    return stale;
  }
}

export class PermissionError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "NOT_MEMBER" | "INSUFFICIENT_ROLE" | "STALE_DEPENDENCY",
    public status: number,
    public extra?: Record<string, unknown>
  ) {
    super(code);
  }
}

// Enforce RBAC puro: el user debe tener al menos `minRole` en el clan.
// Nombre se mantiene por compat con imports existentes; ya no hay bypass
// super admin — el modelo es flat.
export async function requireRoleOrSuperAdminRead(
  userId: string,
  clanId: string,
  minRole: AppRole,
  method: "GET" | "WRITE"
): Promise<{ bypass: false; role: AppRole | null; stale: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new PermissionError("UNAUTHORIZED", 401);

  const current = await getUserRoleInClan(userId, clanId);
  if (current.stale && method === "WRITE") {
    throw new PermissionError("STALE_DEPENDENCY", 503, { reason: "vigil_bot_unreachable" });
  }
  if (!current.appRole) throw new PermissionError("NOT_MEMBER", 403, { clanId });
  if (!hasMinRole(current.appRole, minRole)) {
    throw new PermissionError("INSUFFICIENT_ROLE", 403, {
      required: minRole,
      have: current.appRole,
    });
  }
  return { bypass: false, role: current.appRole, stale: current.stale };
}

export async function isClanMember(userId: string, clanId: string): Promise<boolean> {
  const role = await getUserRoleInClan(userId, clanId);
  return role.appRole !== null && !role.stale;
}
