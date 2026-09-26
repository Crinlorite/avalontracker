import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import { prisma } from "@/lib/prisma";
import { signBody, verifySignature } from "@/lib/hmac";

// Token de dispositivo: `avt_` + 32 bytes aleatorios en base64url. En BD
// solo el SHA-256. Autentica únicamente /api/v1 (spec §5.2, §10).
const PREFIX = "avt_";
const LAST_USED_EVERY_MS = 60 * 60 * 1000;

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado");
  return s;
}

export async function createDeviceToken(userId: string, name: string) {
  const token = PREFIX + crypto.randomBytes(32).toString("base64url");
  const row = await prisma.deviceToken.create({
    data: { userId, name: name.trim().slice(0, 60) || "Dispositivo", tokenHash: hash(token) },
    select: { id: true },
  });
  return { token, deviceId: row.id };
}

export async function verifyDeviceToken(token: string | null | undefined) {
  if (!token || !token.startsWith(PREFIX) || token.length < 40 || token.length > 200) return null;
  const row = await prisma.deviceToken.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    await prisma.deviceToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { userId: row.userId, deviceId: row.id };
}

export function listDeviceTokens(userId: string) {
  return prisma.deviceToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeDeviceToken(userId: string, deviceId: string): Promise<boolean> {
  const r = await prisma.deviceToken.updateMany({ where: { id: deviceId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count > 0;
}

// Código de vínculo (QR o /link/app): firmado con AUTH_SECRET, 60 s, un
// solo uso. La lista de usados vive en memoria: la app corre en una sola
// instancia (como los límites de peticiones).
const LINK_TTL_MS = 60_000;
const used = new LRUCache<string, true>({ max: 10_000, ttl: LINK_TTL_MS * 2 });

export function signLinkCode(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + LINK_TTL_MS}.${crypto.randomBytes(8).toString("base64url")}`;
  return `${payload}.${signBody(payload, secret())}`;
}

export function consumeLinkCode(code: string | undefined, now = Date.now()): string | null {
  if (!code || code.length > 256) return null;
  const parts = code.split(".");
  if (parts.length !== 4) return null;
  const [userId, exp, nonce, sig] = parts;
  if (!/^[a-z0-9]{10,40}$/i.test(userId) || !/^\d{10,16}$/.test(exp) || !/^[A-Za-z0-9_-]{8,16}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (!verifySignature(`${userId}.${exp}.${nonce}`, sig, secret())) return null;
  if (Number(exp) < now) return null;
  if (used.has(code)) return null;
  used.set(code, true);
  return userId;
}
