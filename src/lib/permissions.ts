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
  error?: "BOT_NOT_IN_GUILD";
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
  } catch (err) {
    // Bot unreachable. El creator del clan se reconoce como ADMIN
    // SIN marcarlo stale: su rol es intrínseco a la fila de Clan
    // (createdById), no depende de roles de Discord, así que no
    // tiene sentido bloquearle WRITE cuando el bot está caído.
    if (isCreator) {
      const owner: CachedRole = {
        appRole: "ADMIN",
        stale: false,
        syncedAt: new Date(),
      };
      roleCache.set(key, owner);
      return owner;
    }
    // Bot está vivo pero NO es miembro de la guild Discord del clan.
    // Permanente — esperar no lo arregla, hay que invitar el bot. Lo
    // surfaceamos como error explícito en vez de stale para que el API
    // devuelva 412 con CTA "Invita el bot" en lugar del 503 ambiguo.
    const errCode = (err as { code?: string })?.code;
    if (errCode === "VIGIL_BOT_NOT_IN_GUILD") {
      const notInGuild: CachedRole = {
        appRole: null,
        stale: false,
        syncedAt: new Date(),
        error: "BOT_NOT_IN_GUILD",
      };
      roleCache.set(key, notInGuild);
      return notInGuild;
    }
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
    public code:
      | "UNAUTHORIZED"
      | "NOT_MEMBER"
      | "INSUFFICIENT_ROLE"
      | "BOT_NOT_IN_GUILD"
      | "STALE_DEPENDENCY",
    public status: number,
    public extra?: Record<string, unknown>
  ) {
    super(code);
  }
}

// Mensaje human-readable derivado del code. Antes todas las rutas
// devolvían "Sin permisos" para cualquier fallo, lo que hacía
// imposible diagnosticar (NOT_MEMBER vs BOT_NOT_IN_GUILD vs
// STALE_DEPENDENCY se ven idénticos al usuario). Cada code tiene
// ahora su propio CTA.
export function permissionErrorMessage(e: PermissionError): string {
  switch (e.code) {
    case "UNAUTHORIZED":
      return "Sesión no válida — vuelve a iniciar sesión";
    case "NOT_MEMBER":
      return "No tienes rol asignado en este clan. Pide al admin que mapee tu rol de Discord en Ajustes → Roles";
    case "INSUFFICIENT_ROLE": {
      const have = (e.extra?.have as string | undefined) ?? "VIEWER";
      const required = (e.extra?.required as string | undefined) ?? "superior";
      return `Tu rol (${have}) no permite esta acción — necesitas ${required} o superior`;
    }
    case "BOT_NOT_IN_GUILD":
      return "El bot Vigil no está en el servidor de Discord del clan. El admin del clan tiene que invitarlo desde el botón en la landing";
    case "STALE_DEPENDENCY":
      return "El bot Vigil está caído y tu rol no se ha podido refrescar. Reintenta en unos minutos";
  }
}

// Stale-write grace: cuando Vigil Bot está caído usamos el último rol
// sincronizado como respaldo. Aceptamos WRITES si el sync es < 24h
// (suficiente para sobrevivir caídas transitorias del bot sin abrir
// peligrosamente la ventana de "rol revocado y nadie lo sabe"). Si el
// usuario fue degradado en Discord, el webhook ROLE_CHANGE de Vigil
// ya invalida la caché en cuanto el bot vuelve a estar online.
const STALE_WRITE_GRACE_MS = 24 * 60 * 60 * 1000;

// Enforce RBAC: el user debe tener al menos `minRole` EN ESTE clan.
// Los roles están scoped al clan; no hay autoridad global que pase
// por encima.
export async function requireRole(
  userId: string,
  clanId: string,
  minRole: AppRole,
  method: "GET" | "WRITE"
): Promise<{ role: AppRole; stale: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new PermissionError("UNAUTHORIZED", 401);

  const current = await getUserRoleInClan(userId, clanId);
  // Surfacear primero el error de setup permanente para que el frontend
  // muestre CTA "Invita el bot" — sin esto cae en NOT_MEMBER y suena a
  // problema del usuario cuando es de configuración del clan.
  if (current.error === "BOT_NOT_IN_GUILD") {
    throw new PermissionError("BOT_NOT_IN_GUILD", 412, {
      reason: "vigil_bot_not_in_guild",
    });
  }
  if (!current.appRole) throw new PermissionError("NOT_MEMBER", 403, { clanId });
  if (!hasMinRole(current.appRole, minRole)) {
    throw new PermissionError("INSUFFICIENT_ROLE", 403, {
      required: minRole,
      have: current.appRole,
    });
  }
  // Stale + WRITE: solo bloqueamos si la caché de rol es antigua. Con un
  // sync reciente (<24h) confiamos en el último estado conocido — los
  // webhooks de Vigil Bot mantienen la caché al día en operación normal.
  if (current.stale && method === "WRITE") {
    const ageMs = Date.now() - current.syncedAt.getTime();
    if (ageMs > STALE_WRITE_GRACE_MS) {
      throw new PermissionError("STALE_DEPENDENCY", 503, {
        reason: "vigil_bot_unreachable",
        lastSyncAt: current.syncedAt.toISOString(),
      });
    }
  }
  return { role: current.appRole, stale: current.stale };
}

export async function isClanMember(userId: string, clanId: string): Promise<boolean> {
  const role = await getUserRoleInClan(userId, clanId);
  return role.appRole !== null && !role.stale;
}
