// Límites por IP de /api/health, /api/feedback y los webhooks de Vigil: se
// cuentan por la IP real del cliente (clientIp: CF-Connecting-IP), no por
// X-Forwarded-For, que en producción trae la IP del borde de Cloudflare,
// compartida por muchos clientes. /api/feedback además no tenía ningún
// límite: sin Turnstile configurado, cualquiera podía llenar el Discord de
// tickets.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]), clan: { findFirst: vi.fn(async () => null) } },
}));
process.env.VIGIL_BOT_SHARED_SECRET = "vigil-secret-for-tests";
process.env.FEEDBACK_SECRET = "feedback-secret";
process.env.VIGIL_BOT_URL = "http://bot.test";

const EDGE = "172.70.0.9";
const hdr = (cf: string, extra: Record<string, string> = {}) => ({ "x-forwarded-for": EDGE, "cf-connecting-ip": cf, ...extra });

describe("GET /api/health", () => {
  it("60 por minuto y cliente; otro cliente tras el mismo borde no se bloquea", async () => {
    const { GET } = await import("@/app/api/health/route");
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await GET(new Request("http://t/api/health", { headers: hdr("203.0.113.10") }))).status;
    expect(last).toBe(429);
    expect((await GET(new Request("http://t/api/health", { headers: hdr("203.0.113.11") }))).status).toBe(200);
  });
});

describe("POST /api/feedback", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); delete process.env.TURNSTILE_SECRET; });
  afterAll(() => { vi.unstubAllGlobals(); });
  const ticket = { type: "bug", title: "Un título válido", description: "Una descripción suficientemente larga para pasar la validación.", context: { lang: "es" } };
  const botOk = () => new Response(JSON.stringify({ publicId: "AT-0001", threadUrl: null }), { status: 200, headers: { "content-type": "application/json" } });
  async function send(cf: string, body: Record<string, unknown> = ticket) {
    const { POST } = await import("@/app/api/feedback/route");
    return POST(new Request("http://t/api/feedback", { method: "POST", headers: { "content-type": "application/json", ...hdr(cf) }, body: JSON.stringify(body) }));
  }

  it("5 tickets cada 10 minutos por IP real; el borde compartido no cuenta", async () => {
    fetchMock.mockImplementation(async () => botOk());
    for (let i = 0; i < 5; i++) expect((await send("203.0.113.20")).status).toBe(200);
    const sixth = await send("203.0.113.20");
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error.code).toBe("RATE_LIMITED");
    expect((await send("203.0.113.21")).status).toBe(200);
    // Un ticket rechazado por el límite no llega al bot.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("Turnstile recibe la IP real del cliente, no la del borde", async () => {
    process.env.TURNSTILE_SECRET = "turnstile-secret";
    let remoteip: FormDataEntryValue | null = null;
    fetchMock.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("turnstile")) {
        remoteip = (init?.body as FormData).get("remoteip");
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return botOk();
    });
    expect((await send("203.0.113.30", { ...ticket, turnstileToken: "tok" })).status).toBe(200);
    expect(remoteip).toBe("203.0.113.30");
  });
});

describe("webhooks de Vigil", () => {
  const routes = {
    "guild-update": () => import("@/app/api/webhooks/vigil/guild-update/route"),
    "member-leave": () => import("@/app/api/webhooks/vigil/member-leave/route"),
    "role-change": () => import("@/app/api/webhooks/vigil/role-change/route"),
  };
  it.each(Object.keys(routes) as (keyof typeof routes)[])("%s: 100 por minuto por IP real; el borde compartido no cuenta", async (name) => {
    const { POST } = await routes[name]();
    const post = (cf: string) => POST(new Request(`http://t/api/webhooks/vigil/${name}`, {
      method: "POST", headers: { ...hdr(cf), "content-type": "application/json", "x-vigil-signature": "0".repeat(64) }, body: "{}",
    }));
    let last = 0;
    for (let i = 0; i < 101; i++) last = (await post("203.0.113.40")).status;
    expect(last).toBe(429);
    // Firma inválida, pero no bloqueado: el borde compartido no es la clave.
    expect((await post("203.0.113.41")).status).toBe(401);
  });
});
