import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ROLE_HIERARCHY, invalidateRoleCache, invalidateClanRoleCache } from "@/lib/permissions";
import { createLimiter } from "@/lib/rate-limit";
import type { AppRole } from "@/generated/prisma/client";

export type ShareRole = "VIEWER" | "EDITOR";
export const SITE_URL = "https://avalontracker.app";
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/; // 16 bytes en base64url = 128 bits

// Consultas públicas de enlaces (endpoint y página /m): 20 por minuto e IP.
export const shareLookupLimiter = createLimiter({ windowMs: 60_000, max: 20 });

export const MAX_ACTIVE_SHARES = 20;

export class ShareError extends Error {
  constructor(public code: "NOT_PERSONAL" | "NOT_FOUND" | "LIMIT", public status: number, message: string) { super(message); }
}

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const shareUrl = (token: string) => `${SITE_URL}/m/${token}`;

// Enlace de ver o editar sobre un mapa PERSONAL (spec §5.3). El token se
// enseña una vez; en BD solo su hash.
export async function createShare(clanId: string, role: ShareRole, createdById: string) {
  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { kind: true } });
  if (!clan) throw new ShareError("NOT_FOUND", 404, "Mapa no encontrado");
  if (clan.kind !== "PERSONAL") throw new ShareError("NOT_PERSONAL", 403, "Los clanes de Discord no se comparten por enlace");
  const active = await prisma.mapShare.count({ where: { clanId, revokedAt: null } });
  if (active >= MAX_ACTIVE_SHARES) throw new ShareError("LIMIT", 400, `Máximo ${MAX_ACTIVE_SHARES} enlaces activos por mapa; revoca alguno`);
  const token = crypto.randomBytes(16).toString("base64url");
  const row = await prisma.mapShare.create({ data: { clanId, role, tokenHash: hash(token), createdById }, select: { id: true, role: true, createdAt: true } });
  return { id: row.id, role: row.role as ShareRole, token, url: shareUrl(token), createdAt: row.createdAt.toISOString() };
}

export async function listShares(clanId: string) {
  const rows = await prisma.mapShare.findMany({ where: { clanId, revokedAt: null }, select: { id: true, role: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, role: r.role as ShareRole, createdAt: r.createdAt.toISOString() }));
}

// Revocar = marcar y BORRAR las membresías que nacieron de ese enlace.
export async function revokeShare(clanId: string, shareId: string): Promise<boolean> {
  const r = await prisma.mapShare.updateMany({ where: { id: shareId, clanId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count === 0) return false;
  await prisma.clanMember.deleteMany({ where: { clanId, roleSource: `share:${shareId}` } });
  invalidateClanRoleCache(clanId);
  return true;
}

export async function revokeAllShares(clanId: string): Promise<number> {
  const active = await prisma.mapShare.findMany({ where: { clanId, revokedAt: null }, select: { id: true } });
  for (const s of active) await revokeShare(clanId, s.id);
  return active.length;
}

export async function verifyShare(token: string | undefined) {
  if (!token || !TOKEN_RE.test(token)) return null;
  const row = await prisma.mapShare.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, clanId: true, role: true, revokedAt: true, clan: { select: { kind: true } } },
  });
  if (!row || row.revokedAt || row.clan.kind !== "PERSONAL") return null;
  return { id: row.id, clanId: row.clanId, role: row.role as ShareRole };
}

// Unirse por enlace: crea la membresía con el rol del enlace; si ya había
// una de rango igual o superior (p. ej. el dueño), no la toca.
export async function joinByShare(token: string, userId: string) {
  const share = await verifyShare(token);
  if (!share) return null;
  const existing = await prisma.clanMember.findUnique({ where: { userId_clanId: { userId, clanId: share.clanId } }, select: { appRole: true } });
  const keep = existing?.appRole && ROLE_HIERARCHY[existing.appRole as AppRole] >= ROLE_HIERARCHY[share.role];
  if (!keep) {
    await prisma.clanMember.upsert({
      where: { userId_clanId: { userId, clanId: share.clanId } },
      create: { userId, clanId: share.clanId, appRole: share.role, roleSource: `share:${share.id}`, lastSyncAt: new Date() },
      update: { appRole: share.role, roleSource: `share:${share.id}`, lastSyncAt: new Date() },
    });
    invalidateRoleCache(userId, share.clanId);
  }
  // Se devuelve el rol del enlace; el rol efectivo lo da getUserRoleInClan.
  return { clanId: share.clanId, role: share.role };
}
