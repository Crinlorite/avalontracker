// Respuestas de la API pública de solo lectura: CORS abierto, caché de una
// hora, ETag opcional y límite de 60 peticiones por minuto e IP (spec §10).
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { clientIp } from "@/lib/client-ip";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

export const publicLimiter = createLimiter({ windowMs: 60 * 1000, max: 60 });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type, if-none-match" };

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export function publicApiGuard(req: Request): NextResponse | null {
  const r = consumeToken(publicLimiter, clientIp(req));
  return r.ok ? null : withCors(apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: r.retryAfterMs }));
}

export function publicJson(data: unknown, opts: { etag?: string; req?: Request; maxAge?: number } = {}): NextResponse {
  const cache = `public, s-maxage=${opts.maxAge ?? 3600}, max-age=300, stale-while-revalidate=600`;
  if (opts.etag && opts.req?.headers.get("if-none-match") === opts.etag) {
    return withCors(new NextResponse(null, { status: 304, headers: { etag: opts.etag, "cache-control": cache } }));
  }
  const res = NextResponse.json(data, { headers: { "cache-control": cache, ...(opts.etag ? { etag: opts.etag } : {}) } });
  return withCors(res);
}

export function publicNotFound(message: string): NextResponse {
  return withCors(apiError("NOT_FOUND", 404, message));
}

export function publicBadRequest(message: string): NextResponse {
  return withCors(apiError("VALIDATION_ERROR", 400, message));
}
