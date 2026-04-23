import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_PREFIX = "ingest_";
const TOKEN_BYTES = 32;

export function generateToken(): { raw: string; hash: string } {
  const raw = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export type IngestAuthResult =
  | { ok: true; tokenId: string; userId: string; targetClanId: string }
  | { ok: false; reason: "missing" | "invalid" | "revoked" };

// Extrae + verifica el Bearer token del header. Actualiza lastUsedAt en hit.
export async function authenticateIngest(request: Request): Promise<IngestAuthResult> {
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, reason: "missing" };
  }
  const raw = header.slice(7).trim();
  if (!raw.startsWith(TOKEN_PREFIX)) {
    return { ok: false, reason: "invalid" };
  }
  const hash = hashToken(raw);
  const token = await prisma.ingestToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, targetClanId: true, revokedAt: true },
  });
  if (!token) return { ok: false, reason: "invalid" };
  if (token.revokedAt) return { ok: false, reason: "revoked" };

  // Fire-and-forget update de lastUsedAt (no bloquea respuesta).
  prisma.ingestToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true, tokenId: token.id, userId: token.userId, targetClanId: token.targetClanId };
}
