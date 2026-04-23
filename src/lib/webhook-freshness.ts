import { logger } from "@/lib/logger";

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos

export type FreshnessResult =
  | { ok: true }
  | { ok: false; reason: "stale" | "future" | "invalid" };

// Verifica que el timestamp dentro del body esté dentro de la ventana fresca.
// Defensa contra replay attacks: aunque la firma HMAC sea válida, si el body
// es de hace 1h lo rechazamos.
//
// Modo "lenient": si el body NO trae timestamp, log warning y aceptamos
// (compatibilidad mientras Vigil Bot adopta el cambio). Cuando todos los
// webhooks lleguen con timestamp, cambiar a "strict": missing → rechazo.
export function verifyWebhookFreshness(
  bodyJson: unknown,
  options: { strict?: boolean } = {},
): FreshnessResult {
  const body = bodyJson as { timestamp?: unknown };
  const ts = body?.timestamp;

  if (typeof ts !== "string") {
    if (options.strict) {
      return { ok: false, reason: "invalid" };
    }
    // Lenient: log warning, accept for backwards-compat.
    logger.warn({ timestampType: typeof ts }, "webhook missing timestamp (lenient mode)");
    return { ok: true };
  }

  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) {
    return { ok: false, reason: "invalid" };
  }

  const now = Date.now();
  const ageMs = now - parsed;

  // Rechaza si es del futuro (> 60s tolerancia para clock skew).
  if (ageMs < -60_000) return { ok: false, reason: "future" };

  // Rechaza si tiene > 5 min de antigüedad — replay protection.
  if (ageMs > MAX_AGE_MS) return { ok: false, reason: "stale" };

  return { ok: true };
}
