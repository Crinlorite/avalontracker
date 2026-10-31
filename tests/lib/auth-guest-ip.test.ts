// Las altas de invitado (5 por hora) se cuentan por la IP real del cliente
// (CF-Connecting-IP, como clientIp). Con X-Forwarded-For —en producción, la IP
// del borde de Cloudflare— cinco invitados de una misma región agotaban el
// cupo de todos los demás, y el límite dejaba de frenar a quien quisiera
// llenar la base de datos de cuentas vacías.
import { it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = "test-secret-for-guest-signin-0123456789abcdef";
process.env.AUTH_URL = "http://localhost:3000";
process.env.AUTH_TRUST_HOST = "true";

const seq = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { create: vi.fn(async () => ({ id: `guest${++seq.n}`, discordUsername: "Guest" })) } },
}));
vi.mock("@/lib/vigil-bot-client", () => ({ fetchUserClans: vi.fn(async () => []) }));

// Entra como invitado igual que el navegador: CSRF de Auth.js y POST al callback.
async function signInAsGuest(h: Record<string, string>) {
  const { handlers } = await import("@/lib/auth");
  const csrf = await handlers.GET(new NextRequest("http://localhost:3000/api/auth/csrf"));
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const res = await handlers.POST(new NextRequest("http://localhost:3000/api/auth/callback/guest", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie, ...h },
    body: new URLSearchParams({ csrfToken, callbackUrl: "http://localhost:3000/map" }),
  }));
  const session = res.headers.getSetCookie().some((c) => /^authjs\.session-token=[^;]+/.test(c));
  return { status: res.status, location: res.headers.get("location") ?? "", session };
}

it("cinco invitados por IP real; el borde de Cloudflare compartido no cuenta", async () => {
  const edge = { "x-forwarded-for": "172.70.0.9" };
  for (let i = 0; i < 5; i++) {
    expect((await signInAsGuest({ ...edge, "cf-connecting-ip": "203.0.113.1" })).session).toBe(true);
  }
  const sixth = await signInAsGuest({ ...edge, "cf-connecting-ip": "203.0.113.1" });
  expect(sixth.session).toBe(false);
  expect(sixth.location).toContain("error=");
  // Otro cliente tras el mismo borde: entra.
  expect((await signInAsGuest({ ...edge, "cf-connecting-ip": "203.0.113.2" })).session).toBe(true);
});
