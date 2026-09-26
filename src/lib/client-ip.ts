// IP del cliente tras los proxies. En producción la cadena es Cloudflare →
// Traefik (Coolify) → Next, y Traefik no confía en cabeceras reenviadas: pisa
// X-Forwarded-For con la IP del edge de Cloudflare. Cloudflare deja la IP
// real en CF-Connecting-IP; sin Cloudflare, Traefik pone X-Real-IP. Sin
// dependencias: lo usan las rutas públicas sin cargar NextAuth.
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
