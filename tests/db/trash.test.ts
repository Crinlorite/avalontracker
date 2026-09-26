// Papelera a 7 días y Route.deletedAt (plan fase 1, Tarea 1).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

let seq = 0;
async function ownerWithMap() {
  seq++;
  const u = await prisma.user.create({ data: { discordId: `1000000000000000${seq}`.slice(0, 18), discordUsername: `u${seq}`, email: `u${seq}@x.test` } });
  const clan = await prisma.clan.create({ data: { name: `map-${seq}`, kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  const [a, b, c] = await Promise.all(["Casitos-Atinaum", "Hiles-Izizaum", "Coros-Atinaum"].map((name) =>
    prisma.zone.upsert({ where: { name }, create: { name, type: "AVALON", tier: 6 }, update: {} })));
  const route = await prisma.route.create({ data: { clanId: clan.id, createdById: u.id, hops: { create: [
    { order: 0, fromZoneId: a.id, toZoneId: b.id, portalSize: 7, expiresAt: new Date(Date.now() + 3600e3) },
    { order: 1, fromZoneId: b.id, toZoneId: c.id, portalSize: 20, expiresAt: new Date(Date.now() + 7200e3) },
  ] } }, include: { hops: true } });
  session.current = { user: { id: u.id } };
  return { u, clan, route };
}
const ctx = (clanId: string, routeId: string) => ({ params: Promise.resolve({ clanId, routeId }) });

describe("papelera 7 días", () => {
  it("borrar la ruta entera marca Route.deletedAt; borrar un salto no", async () => {
    const { DELETE } = await import("@/app/api/clans/[clanId]/routes/[routeId]/route");
    const { clan, route } = await ownerWithMap();
    const partial = await DELETE(new Request(`http://t/x?hops=${route.hops[1].id}`, { method: "DELETE" }), ctx(clan.id, route.id));
    expect(partial.status).toBe(204);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: route.id } })).deletedAt).toBeNull();
    const whole = await DELETE(new Request("http://t/x", { method: "DELETE" }), ctx(clan.id, route.id));
    expect(whole.status).toBe(204);
    const r = await prisma.route.findUniqueOrThrow({ where: { id: route.id }, include: { hops: true } });
    expect(r.deletedAt).not.toBeNull();
    expect(r.hops.every((h) => h.deletedAt !== null)).toBe(true);
  });

  it("restaurar limpia Route.deletedAt", async () => {
    const { DELETE } = await import("@/app/api/clans/[clanId]/routes/[routeId]/route");
    const { POST: restore } = await import("@/app/api/clans/[clanId]/routes/[routeId]/restore/route");
    const { clan, route } = await ownerWithMap();
    await DELETE(new Request("http://t/x", { method: "DELETE" }), ctx(clan.id, route.id));
    expect((await restore(new Request("http://t/x", { method: "POST" }), ctx(clan.id, route.id))).status).toBe(200);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: route.id } })).deletedAt).toBeNull();
  });

  it("el barrido conserva a los 6 días y elimina a los 8", async () => {
    const { GET } = await import("@/app/api/clans/[clanId]/routes/route");
    const { clan, route } = await ownerWithMap();
    const at = (days: number) => new Date(Date.now() - days * 864e5);
    await prisma.route.update({ where: { id: route.id }, data: { deletedAt: at(6), hops: { updateMany: { where: {}, data: { deletedAt: at(6) } } } } });
    await GET(new Request("http://t/x"), { params: Promise.resolve({ clanId: clan.id }) });
    expect(await prisma.route.findUnique({ where: { id: route.id } })).not.toBeNull();
    await prisma.route.update({ where: { id: route.id }, data: { deletedAt: at(8), hops: { updateMany: { where: {}, data: { deletedAt: at(8) } } } } });
    await GET(new Request("http://t/x"), { params: Promise.resolve({ clanId: clan.id }) });
    expect(await prisma.route.findUnique({ where: { id: route.id } })).toBeNull();
  });
});
