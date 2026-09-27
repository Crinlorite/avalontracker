// Página /m/<token>: el título (generateMetadata) y la página comparten una
// sola búsqueda del enlace por petición y pasan por el mismo límite por IP.
import { it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "./setup";

vi.mock("@/lib/vigil-bot-client", () => ({
  fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {},
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
const reqCtx = vi.hoisted(() => ({ ip: "10.7.0.1", cf: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": reqCtx.ip, ...(reqCtx.cf ? { "cf-connecting-ip": reqCtx.cf } : {}) }),
}));
vi.mock("@/components/share/SharedMap", () => ({ SharedMap: () => null }));
vi.mock("@/lib/map-shares", async (orig) => {
  const m = await orig<typeof import("@/lib/map-shares")>();
  return { ...m, verifyShare: vi.fn(m.verifyShare) };
});
// `cache` de React memoiza por petición dentro de Next; fuera de Next no
// guarda nada. Aquí cada prueba es una petición: se vacía en beforeEach.
const memo = vi.hoisted(() => ({ stores: [] as Map<string, unknown>[] }));
vi.mock("react", async (orig) => {
  const r = await orig<typeof import("react")>();
  const cache = <A extends unknown[], R>(fn: (...a: A) => R) => {
    const store = new Map<string, unknown>(); memo.stores.push(store);
    return (...a: A): R => {
      const k = JSON.stringify(a);
      if (!store.has(k)) store.set(k, fn(...a));
      return store.get(k) as R;
    };
  };
  return { ...r, cache, default: { ...r, cache } };
});

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let shares: typeof import("@/lib/map-shares");
let rl: typeof import("@/lib/rate-limit");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  shares = await import("@/lib/map-shares");
  rl = await import("@/lib/rate-limit");
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
beforeEach(() => { for (const s of memo.stores) s.clear(); vi.mocked(shares.verifyShare).mockClear(); reqCtx.cf = null; });

let seq = 0;
async function sharedMap() {
  seq++;
  const u = await prisma.user.create({ data: { discordId: `9100000000000000${seq}`.slice(0, 18), discordUsername: `p${seq}`, email: `p${seq}@x.test` } });
  const map = await prisma.clan.create({ data: { name: `page-${seq}`, kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: map.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  const s = await shares.createShare(map.id, "VIEWER", u.id);
  return { map, s };
}

it("con la IP bloqueada, el título no consulta el enlace ni enseña el nombre del mapa", async () => {
  const page = await import("@/app/m/[token]/page");
  const { s } = await sharedMap();
  reqCtx.ip = "10.7.0.2";
  for (let i = 0; i < 20; i++) rl.consumeToken(shares.shareLookupLimiter, reqCtx.ip);
  const meta = await page.generateMetadata({ params: Promise.resolve({ token: s.token }) });
  expect(meta.title).toBe("Shared map");
  expect(shares.verifyShare).not.toHaveBeenCalled();
});

it("título y página hacen una sola búsqueda del enlace por petición", async () => {
  const page = await import("@/app/m/[token]/page");
  const { map, s } = await sharedMap();
  reqCtx.ip = "10.7.0.3";
  const params = Promise.resolve({ token: s.token });
  expect((await page.generateMetadata({ params })).title).toBe(`${map.name} · shared map`);
  await page.default({ params });
  expect(shares.verifyShare).toHaveBeenCalledTimes(1);
});

// En producción X-Forwarded-For trae la IP del borde de Cloudflare (Traefik la
// pisa); la del cliente viene en CF-Connecting-IP, como en la API (clientIp).
it("el límite por IP cuenta por CF-Connecting-IP, no por el borde de Cloudflare en X-Forwarded-For", async () => {
  const page = await import("@/app/m/[token]/page");
  const { s } = await sharedMap();
  reqCtx.ip = "172.70.0.9"; // borde de Cloudflare, compartido por muchos clientes
  reqCtx.cf = "203.0.113.7"; // cliente real, ya agotado
  for (let i = 0; i < 20; i++) rl.consumeToken(shares.shareLookupLimiter, reqCtx.cf);
  const meta = await page.generateMetadata({ params: Promise.resolve({ token: s.token }) });
  expect(meta.title).toBe("Shared map");
  expect(shares.verifyShare).not.toHaveBeenCalled();
  // Un fallo se cobra al cliente, no al borde.
  for (const st of memo.stores) st.clear();
  reqCtx.cf = "203.0.113.8";
  await page.generateMetadata({ params: Promise.resolve({ token: "no-existe" }) });
  expect(shares.shareLookupLimiter.cache.get("203.0.113.8")?.count).toBe(1);
  expect(shares.shareLookupLimiter.cache.get("172.70.0.9")).toBeUndefined();
});
