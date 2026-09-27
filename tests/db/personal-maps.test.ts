// 🔴 Mapas personales e invitados: aislamiento entre clanes, cookie de
// reclamación y fusión de cuentas. Tests adversariales contra BD real.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "./setup";

const bot = vi.hoisted(() => ({
  fetchUserRoleFromBot: vi.fn(),
  fetchGuildHealth: vi.fn(),
  fetchUserGuildPermissions: vi.fn(),
}));
vi.mock("@/lib/vigil-bot-client", () => ({
  ...bot,
  GuildOrMemberNotFoundError: class extends Error {},
  BotUnavailableError: class extends Error {},
}));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));

process.env.AUTH_SECRET = "test-secret-for-claims-0123456789abcdef";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let perms: typeof import("@/lib/permissions");
let guest: typeof import("@/lib/guest");

beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  perms = await import("@/lib/permissions");
  guest = await import("@/lib/guest");
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
async function discordUser() {
  seq++;
  const id = String(BigInt("100000000000000000") + BigInt(seq));
  return prisma.user.create({ data: { discordId: id, discordUsername: `u${seq}`, email: `u${seq}@x.test` } });
}
async function personalMap(ownerId: string) {
  seq++;
  const clan = await prisma.clan.create({ data: { name: `map-${seq}`, kind: "PERSONAL", createdById: ownerId } });
  await prisma.clanMember.create({ data: { userId: ownerId, clanId: clan.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  return clan;
}
async function discordClan(ownerId: string) {
  seq++;
  return prisma.clan.create({ data: { name: `clan-${seq}`, kind: "DISCORD", discordGuildId: String(BigInt("200000000000000000") + BigInt(seq)), discordGuildName: "G", createdById: ownerId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  bot.fetchUserRoleFromBot.mockResolvedValue({ computedAppRole: "EDITOR", discordRoleIds: ["r"] });
});

describe("claim cookie", () => {
  it("acepta una firma válida y dentro de plazo", () => {
    expect(guest.verifyClaim(guest.signClaim("cabc1234567890xyz"))).toBe("cabc1234567890xyz");
  });
  it("rechaza id cambiado, firma cambiada, caducada, formato raro y otro secreto", () => {
    const good = guest.signClaim("cabc1234567890xyz");
    const [, exp, sig] = good.split(".");
    expect(guest.verifyClaim(`cother1234567890x.${exp}.${sig}`)).toBeNull();
    expect(guest.verifyClaim(`cabc1234567890xyz.${exp}.${"0".repeat(64)}`)).toBeNull();
    expect(guest.verifyClaim(`cabc1234567890xyz.${Number(exp) + 1}.${sig}`)).toBeNull();
    expect(guest.verifyClaim(guest.signClaim("cabc1234567890xyz", Date.now() - 11 * 60 * 1000))).toBeNull();
    for (const bad of ["", "a.b", "a.b.c.d", "x".repeat(500), "cabc1234567890xyz.1.zz"]) expect(guest.verifyClaim(bad)).toBeNull();
    expect(guest.verifyClaim(undefined)).toBeNull();
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "otro-secreto-distinto-0123456789abcdef";
    expect(guest.verifyClaim(good)).toBeNull();
    process.env.AUTH_SECRET = prev;
  });
});

describe("roles en mapas personales", () => {
  it("el dueño es ADMIN y no se consulta a Vigil", async () => {
    const u = await discordUser();
    const m = await personalMap(u.id);
    expect((await perms.getUserRoleInClan(u.id, m.id)).appRole).toBe("ADMIN");
    expect(bot.fetchUserRoleFromBot).not.toHaveBeenCalled();
  });
  it("otra persona no tiene acceso (ni lectura) y tampoco se consulta a Vigil", async () => {
    const owner = await discordUser();
    const other = await discordUser();
    const m = await personalMap(owner.id);
    expect((await perms.getUserRoleInClan(other.id, m.id)).appRole).toBeNull();
    await expect(perms.requireRole(other.id, m.id, "VIEWER", "GET")).rejects.toMatchObject({ code: "NOT_MEMBER" });
    expect(bot.fetchUserRoleFromBot).not.toHaveBeenCalled();
  });
  it("un invitado nunca es miembro de un clan de Discord y su id sintético no llega al bot", async () => {
    const owner = await discordUser();
    const c = await discordClan(owner.id);
    const g = await guest.createGuestUser();
    await expect(perms.requireRole(g.id, c.id, "VIEWER", "GET")).rejects.toMatchObject({ code: "NOT_MEMBER" });
    // Ni siquiera con una fila de membresía colada a mano.
    await prisma.clanMember.create({ data: { userId: g.id, clanId: c.id, appRole: "ADMIN" } });
    perms.invalidateRoleCache(g.id);
    await expect(perms.requireRole(g.id, c.id, "VIEWER", "GET")).rejects.toMatchObject({ code: "NOT_MEMBER" });
    expect(bot.fetchUserRoleFromBot).not.toHaveBeenCalled();
  });
  it("los clanes de Discord siguen yendo por Vigil", async () => {
    const owner = await discordUser();
    const member = await discordUser();
    const c = await discordClan(owner.id);
    expect((await perms.getUserRoleInClan(member.id, c.id)).appRole).toBe("EDITOR");
    expect(bot.fetchUserRoleFromBot).toHaveBeenCalledWith(c.discordGuildId, member.discordId);
  });
});

describe("fusión de invitado en cuenta real", () => {
  it("pasa mapas, rutas y membresías y borra el invitado", async () => {
    const g = await guest.createGuestUser();
    const m = await personalMap(g.id);
    await prisma.route.create({ data: { clanId: m.id, createdById: g.id } });
    const real = await discordUser();
    expect(await guest.mergeGuestInto(g.id, real.id)).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: g.id } })).toBeNull();
    expect((await prisma.clan.findUniqueOrThrow({ where: { id: m.id } })).createdById).toBe(real.id);
    expect((await prisma.route.findFirstOrThrow({ where: { clanId: m.id } })).createdById).toBe(real.id);
    perms.invalidateRoleCache(real.id);
    expect((await perms.getUserRoleInClan(real.id, m.id)).appRole).toBe("ADMIN");
  });
  it("NO absorbe a una cuenta real aunque se le pase su id (robo de mapas)", async () => {
    const victim = await discordUser();
    const vm = await personalMap(victim.id);
    const attacker = await discordUser();
    expect(await guest.mergeGuestInto(victim.id, attacker.id)).toBe(0);
    expect((await prisma.clan.findUniqueOrThrow({ where: { id: vm.id } })).createdById).toBe(victim.id);
    expect(await prisma.user.findUnique({ where: { id: victim.id } })).not.toBeNull();
  });
  it("NO fusiona hacia otro invitado ni consigo mismo", async () => {
    const g1 = await guest.createGuestUser();
    const g2 = await guest.createGuestUser();
    await personalMap(g1.id);
    expect(await guest.mergeGuestInto(g1.id, g2.id)).toBe(0);
    expect(await guest.mergeGuestInto(g1.id, g1.id)).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: g1.id } })).not.toBeNull();
  });
  it("si la cuenta real ya estaba en el clan, conserva su membresía", async () => {
    const g = await guest.createGuestUser();
    const real = await discordUser();
    const m = await personalMap(real.id);
    await prisma.clanMember.create({ data: { userId: g.id, clanId: m.id, appRole: "VIEWER" } });
    await guest.mergeGuestInto(g.id, real.id);
    const rows = await prisma.clanMember.findMany({ where: { clanId: m.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: real.id, appRole: "ADMIN" });
  });
});

describe("purga de invitados inactivos", () => {
  it("borra invitados viejos con sus mapas y deja los activos y las cuentas reales", async () => {
    const old = await guest.createGuestUser();
    const oldMap = await personalMap(old.id);
    await prisma.route.create({ data: { clanId: oldMap.id, createdById: old.id } });
    await prisma.user.update({ where: { id: old.id }, data: { lastSeenAt: new Date(Date.now() - 31 * 864e5) } });
    const fresh = await guest.createGuestUser();
    const real = await discordUser();
    await prisma.user.update({ where: { id: real.id }, data: { lastSeenAt: new Date(0) } });
    await guest.purgeIdleGuests();
    expect(await prisma.user.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.clan.findUnique({ where: { id: oldMap.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
  });
});

describe("API /api/maps y /api/clans/:id/convert", () => {
  const post = (body: unknown) => new Request("http://t/api", { method: "POST", body: JSON.stringify(body) });

  it("sin sesión → 401; con sesión crea hasta 3 mapas y luego rechaza", async () => {
    const { POST } = await import("@/app/api/maps/route");
    session.current = null;
    expect((await POST(post({}))).status).toBe(401);
    const u = await discordUser();
    session.current = { user: { id: u.id } };
    for (let i = 0; i < 3; i++) expect((await POST(post({}))).status).toBe(201);
    expect((await POST(post({}))).status).toBe(400);
    expect(await prisma.clan.count({ where: { createdById: u.id, kind: "PERSONAL" } })).toBe(3);
  });
  it("sesión de un usuario que ya no existe (cuenta borrada o invitado purgado) → 401, no 500", async () => {
    const { POST } = await import("@/app/api/maps/route");
    const { POST: postV1 } = await import("@/app/api/v1/maps/route");
    const { POST: importV1 } = await import("@/app/api/v1/import/route");
    const { encodeRouteCode } = await import("@/lib/route-codec");
    for (const name of ["Casitos-Atinaum", "Hiles-Izizaum"]) await prisma.zone.upsert({ where: { name }, create: { name, type: "AVALON", tier: 6 }, update: {} });
    const code = encodeRouteCode({ hops: [{ fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(Date.now() + 3600e3), status: "ACTIVE" }] });
    const u = await discordUser();
    await prisma.user.delete({ where: { id: u.id } });
    session.current = { user: { id: u.id } };
    expect((await POST(post({}))).status).toBe(401);
    expect((await postV1(post({}))).status).toBe(401);
    expect((await importV1(post({ code }))).status).toBe(401);
    expect(await prisma.clan.count({ where: { createdById: u.id } })).toBe(0);
  });
  it("rechaza campos extra (no se puede colar kind/discordGuildId)", async () => {
    const { POST } = await import("@/app/api/maps/route");
    const u = await discordUser();
    session.current = { user: { id: u.id } };
    expect((await POST(post({ kind: "DISCORD", discordGuildId: "1" }))).status).toBe(400);
  });
  it("convertir: solo el dueño, solo mapas personales, nunca un invitado", async () => {
    const { POST } = await import("@/app/api/clans/[clanId]/convert/route");
    bot.fetchGuildHealth.mockResolvedValue({ installed: true });
    bot.fetchUserGuildPermissions.mockResolvedValue({ canRegisterClan: true });
    const body = { name: "Mi Clan", discordGuildId: "123456789012345678", discordGuildName: "G" };
    const ctx = (clanId: string) => ({ params: Promise.resolve({ clanId }) });

    const owner = await discordUser();
    const m = await personalMap(owner.id);
    // Otro usuario (sin acceso) → rechazado por permisos.
    const other = await discordUser();
    session.current = { user: { id: other.id } };
    expect((await POST(post(body), ctx(m.id))).status).toBe(403);
    // Un ADMIN añadido a mano que no es el dueño → rechazado.
    await prisma.clanMember.create({ data: { userId: other.id, clanId: m.id, appRole: "ADMIN" } });
    perms.invalidateRoleCache(other.id);
    expect((await POST(post(body), ctx(m.id))).status).toBe(403);
    // Invitado dueño de su mapa → rechazado (no puede ligar Discord).
    const g = await guest.createGuestUser();
    const gm = await personalMap(g.id);
    session.current = { user: { id: g.id } };
    expect((await POST(post({ ...body, name: "Otro" }), ctx(gm.id))).status).toBe(401);
    // Sin permisos en el servidor de Discord → rechazado.
    session.current = { user: { id: owner.id } };
    bot.fetchUserGuildPermissions.mockResolvedValueOnce({ canRegisterClan: false });
    expect((await POST(post(body), ctx(m.id))).status).toBe(403);
    // Dueño con permisos → convertido, y ya no se puede repetir.
    const ok = await POST(post(body), ctx(m.id));
    expect(ok.status).toBe(200);
    const c = await prisma.clan.findUniqueOrThrow({ where: { id: m.id } });
    expect(c).toMatchObject({ kind: "DISCORD", discordGuildId: body.discordGuildId, name: "Mi Clan" });
    expect((await POST(post(body), ctx(m.id))).status).toBe(409);
  });
});
