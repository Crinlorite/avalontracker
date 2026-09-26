// Respuestas de la API pública de solo lectura: CORS abierto, caché de una
// hora, ETag opcional y límite de 60 peticiones por minuto e IP (spec §10).
import { NextResponse } from "next/server";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/client-ip";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

export const publicLimiter = createLimiter({ windowMs: 60 * 1000, max: 60 });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type, if-none-match", "access-control-max-age": "86400" };

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export function publicApiGuard(req: Request): NextResponse | null {
  const r = consumeToken(publicLimiter, clientIp(req));
  return r.ok ? null : withCors(apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: r.retryAfterMs }));
}

// If-None-Match puede traer varios ETags y la forma débil W/"…" (Cloudflare
// debilita el ETag al recomprimir): se compara sin el prefijo.
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((s) => s.trim().replace(/^W\//, "") === etag);
}

export function publicJson(data: unknown, opts: { etag?: string; req?: Request; maxAge?: number } = {}): NextResponse {
  const cache = `public, s-maxage=${opts.maxAge ?? 3600}, max-age=300, stale-while-revalidate=600`;
  if (opts.etag && etagMatches(opts.req?.headers.get("if-none-match") ?? null, opts.etag)) {
    return withCors(new NextResponse(null, { status: 304, headers: { etag: opts.etag, "cache-control": cache } }));
  }
  const res = NextResponse.json(data, { headers: { "cache-control": cache, ...(opts.etag ? { etag: opts.etag } : {}) } });
  return withCors(res);
}

// Preflight CORS (una petición con If-None-Match desde otro origen lo dispara).
export function publicOptions(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

export function publicNotFound(message: string): NextResponse {
  return withCors(apiError("NOT_FOUND", 404, message));
}

export function publicBadRequest(message: string): NextResponse {
  return withCors(apiError("VALIDATION_ERROR", 400, message));
}

export function publicInternalError(err: unknown): NextResponse {
  return withCors(internalError(err));
}
