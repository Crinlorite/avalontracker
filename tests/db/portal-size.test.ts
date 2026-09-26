// Tamaño de portal al estándar del juego: 7 o 20 (plan fase 1, Tarea 2).
import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

vi.mock("@/lib/vigil-bot-client", () => ({
  fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {},
}));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

it("acepta 7 y 20; rechaza 2 y 40 al crear", async () => {
  const { POST } = await import("@/app/api/clans/[clanId]/routes/route");
  const u = await prisma.user.create({ data: { discordId: "100000000000000001", discordUsername: "u", email: "u@x.test" } });
  const clan = await prisma.clan.create({ data: { name: "m", kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN" } });
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum"]) await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} });
  session.current = { user: { id: u.id } };
  const post = (portalSize: number) => POST(new Request("http://t/x", { method: "POST", body: JSON.stringify({ hops: [
    { fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize, expiresAt: new Date(Date.now() + 3600e3).toISOString() }] }) }),
    { params: Promise.resolve({ clanId: clan.id }) });
  expect((await post(40)).status).toBe(400);
  expect((await post(2)).status).toBe(400);
  expect((await post(7)).status).toBe(201);
});
