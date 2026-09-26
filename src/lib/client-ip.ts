// IP del cliente tras el proxy (Traefik/Coolify). Sin dependencias: lo usan
// las rutas públicas sin cargar NextAuth.
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
