// Enlaces compartidos de mapas personales (plan fase 1, Tarea 7).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

const bot = vi.hoisted(() => ({ fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn() }));
vi.mock("@/lib/vigil-bot-client", () => ({ ...bot, GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {} }));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-shares-0123456789abcdefg";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let shares: typeof import("@/lib/map-shares");
let perms: typeof import("@/lib/permissions");
let dt: typeof import("@/lib/device-tokens");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  shares = await import("@/lib/map-shares");
  perms = await import("@/lib/permissions");
  dt = await import("@/lib/device-tokens");
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
const user = () => prisma.user.create({ data: { discordId: `5000000000000000${++seq}`.slice(0, 18), discordUsername: `h${seq}`, email: `h${seq}@x.test` } });
async function personalMap(ownerId: string) {
  const clan = await prisma.clan.create({ data: { name: `share-${++seq}`, kind: "PERSONAL", createdById: ownerId } });
  await prisma.clanMember.create({ data: { userId: ownerId, clanId: clan.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  return clan;
}
const req = (url: string, opts: { token?: string; body?: unknown; method?: string; ip?: string } = {}) =>
  new Request(url, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "10.1.1.1", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

describe("enlaces compartidos", () => {
  it("crea ver/editar en un mapa personal; un clan de Discord → 403", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/shares/route");
    const owner = await user(); const map = await personalMap(owner.id); const { token } = await dt.createDeviceToken(owner.id, "t");
    const r = await POST(req("http://t/x", { token, body: { role: "EDITOR" } }), { params: Promise.resolve({ id: map.id }) });
    expect(r.status).toBe(201);
    const s = await r.json(); expect(s.url).toMatch(/\/m\/[A-Za-z0-9_-]{22}$/); expect(s.role).toBe("EDITOR");
    const discord = await prisma.clan.create({ data: { name: `d-${seq}`, kind: "DISCORD", discordGuildId: `6000000000000000${seq}`.slice(0, 18), discordGuildName: "G", createdById: owner.id } });
    await prisma.clanMember.create({ data: { userId: owner.id, clanId: discord.id, appRole: "ADMIN", roleSource: "creator:permanent" } });
    bot.fetchUserRoleFromBot.mockResolvedValue({ computedAppRole: "ADMIN", discordRoleIds: [] });
    expect((await POST(req("http://t/x", { token, body: { role: "VIEWER" } }), { params: Promise.resolve({ id: discord.id }) })).status).toBe(403);
  });

  it("ver: el token abre el mapa sin cuenta; revocado → 404; token inventado → 404", async () => {
    const { GET } = await import("@/app/api/v1/shares/[token]/route");
    const owner = await user(); const map = await personalMap(owner.id);
    const s = await shares.createShare(map.id, "VIEWER", owner.id);
    const ok = await GET(req("http://t/x"), { params: Promise.resolve({ token: s.token }) });
    expect(ok.status).toBe(200); expect((await ok.json()).map.id).toBe(map.id);
    expect(await shares.revokeShare(map.id, s.id)).toBe(true);
    expect((await GET(req("http://t/x"), { params: Promise.resolve({ token: s.token }) })).status).toBe(404);
    expect((await GET(req("http://t/x"), { params: Promise.resolve({ token: "A".repeat(22) }) })).status).toBe(404);
  });

  it("unirse: EDITOR da EDITOR (no ADMIN), VIEWER da VIEWER; el dueño no se degrada; revocar expulsa", async () => {
    const owner = await user(); const map = await personalMap(owner.id);
    const edit = await shares.createShare(map.id, "EDITOR", owner.id);
    const view = await shares.createShare(map.id, "VIEWER", owner.id);
    const a = await user(); const b = await user();
    expect(await shares.joinByShare(edit.token, a.id)).toEqual({ clanId: map.id, role: "EDITOR" });
    expect(await shares.joinByShare(view.token, b.id)).toEqual({ clanId: map.id, role: "VIEWER" });
    expect(await shares.joinByShare(view.token, owner.id)).toEqual({ clanId: map.id, role: "VIEWER" });
    expect((await perms.getUserRoleInClan(a.id, map.id)).appRole).toBe("EDITOR");
    expect((await perms.getUserRoleInClan(b.id, map.id)).appRole).toBe("VIEWER");
    expect((await perms.getUserRoleInClan(owner.id, map.id)).appRole).toBe("ADMIN");
    await expect(perms.requireRole(a.id, map.id, "ADMIN", "WRITE")).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await shares.revokeShare(map.id, edit.id);
    await expect(perms.requireRole(a.id, map.id, "VIEWER", "GET")).rejects.toMatchObject({ code: "NOT_MEMBER" });
    expect((await perms.getUserRoleInClan(b.id, map.id)).appRole).toBe("VIEWER");
  });

  it("join por API con token de dispositivo y sin cuenta (401)", async () => {
    const { POST } = await import("@/app/api/v1/shares/[token]/join/route");
    const owner = await user(); const map = await personalMap(owner.id);
    const s = await shares.createShare(map.id, "EDITOR", owner.id);
    expect((await POST(req("http://t/x", { method: "POST" }), { params: Promise.resolve({ token: s.token }) })).status).toBe(401);
    const a = await user(); const { token } = await dt.createDeviceToken(a.id, "t");
    const r = await POST(req("http://t/x", { token, method: "POST" }), { params: Promise.resolve({ token: s.token }) });
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ clanId: map.id, role: "EDITOR" });
  });

  it("adivinar tokens: 20 intentos por minuto e IP, el 21.º → 429", async () => {
    const { GET } = await import("@/app/api/v1/shares/[token]/route");
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await GET(req("http://t/x", { ip: "10.9.9.9" }), { params: Promise.resolve({ token: "B".repeat(22) }) })).status;
    expect(last).toBe(429);
  });

  it("convertir un mapa personal en clan revoca sus enlaces y expulsa a los que entraron por ellos", async () => {
    const { POST: convert } = await import("@/app/api/clans/[clanId]/convert/route");
    bot.fetchGuildHealth.mockResolvedValue({ installed: true }); bot.fetchUserGuildPermissions.mockResolvedValue({ canRegisterClan: true });
    const owner = await user(); const map = await personalMap(owner.id);
    const s = await shares.createShare(map.id, "EDITOR", owner.id);
    const a = await user(); await shares.joinByShare(s.token, a.id);
    session.current = { user: { id: owner.id } };
    const r = await convert(new Request("http://t/x", { method: "POST", body: JSON.stringify({ name: `Clan ${seq}`, discordGuildId: `7000000000000000${seq}`.slice(0, 18), discordGuildName: "G" }) }), { params: Promise.resolve({ clanId: map.id }) });
    expect(r.status).toBe(200);
    expect(await shares.listShares(map.id)).toHaveLength(0);
    expect(await prisma.clanMember.findUnique({ where: { userId_clanId: { userId: a.id, clanId: map.id } } })).toBeNull();
  });
});
