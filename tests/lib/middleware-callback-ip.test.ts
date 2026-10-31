// El límite del callback de autenticación (10 por minuto) cuenta por la IP
// real del cliente (CF-Connecting-IP, como clientIp). En producción
// X-Forwarded-For trae la IP del borde de Cloudflare, común a muchos usuarios:
// contar ahí dejaba sin entrar (Discord e invitado) a toda una región con
// diez intentos por minuto.
import { it, expect } from "vitest";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = "test-secret-for-middleware-0123456789abcdef";

type Middleware = (req: NextRequest, ev: unknown) => Promise<Response | undefined>;
const callback = (h: Record<string, string>) =>
  new NextRequest("http://localhost:3000/api/auth/callback/discord?code=c&state=s", { headers: h });

it("el callback de autenticación se limita por CF-Connecting-IP, no por el borde de Cloudflare", async () => {
  const middleware = (await import("@/middleware")).default as unknown as Middleware;
  const edge = "172.70.0.9";
  let last = 0;
  for (let i = 0; i < 11; i++) {
    last = (await middleware(callback({ "x-forwarded-for": edge, "cf-connecting-ip": "203.0.113.1" }), undefined))?.status ?? 0;
  }
  expect(last).toBe(429);
  // Otro cliente tras el mismo borde entra sin problema.
  const other = await middleware(callback({ "x-forwarded-for": edge, "cf-connecting-ip": "203.0.113.2" }), undefined);
  expect(other?.status).not.toBe(429);
});
