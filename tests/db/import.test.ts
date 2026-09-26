// POST /api/v1/import: importar una ruta compartida por código v1 (plan fase 1, Tarea 9).
import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

vi.mock("@/lib/vigil-bot-client", () => ({
  fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {},
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
process.env.AUTH_SECRET = "test-secret-for-import-0123456789abcdefg";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum"]) await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} });
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

it("importa a un mapa personal (lo crea si no hay) y reutiliza el mismo mapa después; zona desconocida → 400", async () => {
  const { POST } = await import("@/app/api/v1/import/route");
  const { encodeRouteCode } = await import("@/lib/route-codec");
  const dt = await import("@/lib/device-tokens");
  const u = await prisma.user.create({ data: { discordId: "800000000000000001", discordUsername: "i", email: "i@x.test" } });
  const { token } = await dt.createDeviceToken(u.id, "t");
  const code = encodeRouteCode({ hops: [{ fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(Date.now() + 3600e3), status: "ACTIVE" }] });
  const post = (c: string) => POST(new Request("http://t/x", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ code: c }) }));
  const r1 = await post(code); expect(r1.status).toBe(201);
  const { clanId } = await r1.json();
  const r2 = await post(code); expect((await r2.json()).clanId).toBe(clanId);
  expect(await prisma.route.count({ where: { clanId } })).toBe(2);
  const bad = encodeRouteCode({ hops: [{ fromZone: "Nope-Zone", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(Date.now() + 3600e3), status: "ACTIVE" }] });
  expect((await post(bad)).status).toBe(400);
});
