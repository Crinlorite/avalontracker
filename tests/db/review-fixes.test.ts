// Hallazgos de la revisión final de la fase 1 (Important 1-6 + privacidad del enlace de ver).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

vi.mock("@/lib/vigil-bot-client", () => ({
  fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {},
}));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-review-fixes-0123456789";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let dt: typeof import("@/lib/device-tokens");
let shares: typeof import("@/lib/map-shares");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  dt = await import("@/lib/device-tokens");
  shares = await import("@/lib/map-shares");
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum", "Coros-Atinaum"]) await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} });
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
async function owner() {
  const u = await prisma.user.create({ data: { discordId: `9000000000000000${++seq}`.slice(0, 18), discordUsername: `rev${seq}`, globalNickname: `Nick${seq}`, email: `rev${seq}@x.test` } });
  const clan = await prisma.clan.create({ data: { name: `rev-${seq}`, kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  const { token, deviceId } = await dt.createDeviceToken(u.id, "t");
  return { u, clan, token, deviceId };
}
const req = (url: string, opts: { token?: string; body?: unknown; method?: string; ip?: string } = {}) =>
  new Request(url, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? `10.2.0.${seq}`, ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const uuid = () => crypto.randomUUID();
const inH = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

describe("Important 1: Route.deletedAt por sync se propaga a los saltos y la web lo respeta", () => {
  it("borrar desde la app saca la ruta del listado web, la mete en la papelera y restaurar la devuelve", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { GET: listWeb } = await import("@/app/api/clans/[clanId]/routes/route");
    const { GET: trash } = await import("@/app/api/clans/[clanId]/trash/route");
    const { u, clan, token } = await owner();
    session.current = { user: { id: u.id } };
    const id = uuid();
    const first = await (await POST(req("http://t/x", { token, body: { routes: [{ id }], hops: [
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(2) },
    ] } }), ctx(clan.id))).json();
    const base = first.applied.find((a: { key: { kind: string } }) => a.key.kind === "route").server.updatedAt;
    const deletedAt = new Date().toISOString();
    const del = await (await POST(req("http://t/x", { token, body: { routes: [{ id, deletedAt, baseUpdatedAt: base }], hops: [] } }), ctx(clan.id))).json();
    expect(del.rejected).toHaveLength(0);
    const hops = await prisma.routeHop.findMany({ where: { routeId: id } });
    expect(hops.every((h) => h.deletedAt !== null)).toBe(true);
    const web = await (await listWeb(req("http://t/x?status=ALL"), { params: Promise.resolve({ clanId: clan.id }) })).json();
    expect(web.routes.map((r: { id: string }) => r.id)).not.toContain(id);
    const bin = await (await trash(req("http://t/x"), { params: Promise.resolve({ clanId: clan.id }) })).json();
    expect(bin.events.map((e: { routeId: string }) => e.routeId)).toContain(id);
    const base2 = del.applied[0].server.updatedAt;
    const restore = await (await POST(req("http://t/x", { token, body: { routes: [{ id, deletedAt: null, baseUpdatedAt: base2 }], hops: [] } }), ctx(clan.id))).json();
    expect(restore.rejected).toHaveLength(0);
    expect((await prisma.routeHop.findMany({ where: { routeId: id } })).every((h) => h.deletedAt === null)).toBe(true);
    const webAfter = await (await listWeb(req("http://t/x"), { params: Promise.resolve({ clanId: clan.id }) })).json();
    expect(webAfter.routes.map((r: { id: string }) => r.id)).toContain(id);
  });
});

describe("Important 2: el límite de enlaces solo cuenta fallos", () => {
  it("25 consultas válidas seguidas desde la misma IP → todas 200; join con token malo también se limita", async () => {
    const { GET } = await import("@/app/api/v1/shares/[token]/route");
    const { POST: join } = await import("@/app/api/v1/shares/[token]/join/route");
    const { u, clan } = await owner();
    const s = await shares.createShare(clan.id, "VIEWER", u.id);
    const statuses = new Set<number>();
    for (let i = 0; i < 25; i++) statuses.add((await GET(req("http://t/x", { ip: "10.7.7.7" }), { params: Promise.resolve({ token: s.token }) })).status);
    expect([...statuses]).toEqual([200]);
    const other = await owner();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await join(req("http://t/x", { token: other.token, method: "POST", ip: "10.7.7.8" }), { params: Promise.resolve({ token: "C".repeat(22) }) })).status;
    expect(last).toBe(429);
  });
});

describe("Important 3: límite por token de dispositivo y tope de enlaces por mapa", () => {
  it("apiRateLimit corta al superar el máximo del limitador", async () => {
    const { apiRateLimit } = await import("@/lib/api-auth");
    const { createLimiter } = await import("@/lib/rate-limit");
    const lim = createLimiter({ windowMs: 60_000, max: 2 });
    const me = { userId: "cuser", via: "device" as const, deviceId: "cdev" };
    expect(apiRateLimit(me, lim)).toBeNull();
    expect(apiRateLimit(me, lim)).toBeNull();
    expect(apiRateLimit(me, lim)?.status).toBe(429);
    expect(apiRateLimit({ userId: "cotro", via: "session" }, lim)).toBeNull();
  });
  it("un mapa admite como mucho 20 enlaces activos", async () => {
    const { u, clan } = await owner();
    for (let i = 0; i < 20; i++) await shares.createShare(clan.id, "VIEWER", u.id);
    await expect(shares.createShare(clan.id, "VIEWER", u.id)).rejects.toMatchObject({ code: "LIMIT" });
    const first = (await shares.listShares(clan.id))[0];
    await shares.revokeShare(clan.id, first.id);
    await expect(shares.createShare(clan.id, "VIEWER", u.id)).resolves.toBeTruthy();
  });
});

describe("Important 4: el rango de quien ya es miembro no se degrada por un enlace menor", () => {
  it("el dueño conserva su fila ADMIN y un EDITOR por enlace A no cae a VIEWER por el enlace B", async () => {
    const { u, clan } = await owner();
    const view = await shares.createShare(clan.id, "VIEWER", u.id);
    const edit = await shares.createShare(clan.id, "EDITOR", u.id);
    await shares.joinByShare(view.token, u.id);
    expect(await prisma.clanMember.findUnique({ where: { userId_clanId: { userId: u.id, clanId: clan.id } } })).toMatchObject({ appRole: "ADMIN", roleSource: "personal:owner" });
    const a = await owner();
    await shares.joinByShare(edit.token, a.u.id);
    await shares.joinByShare(view.token, a.u.id);
    expect(await prisma.clanMember.findUnique({ where: { userId_clanId: { userId: a.u.id, clanId: clan.id } } })).toMatchObject({ appRole: "EDITOR", roleSource: `share:${edit.id}` });
    await shares.revokeShare(clan.id, view.id);
    expect(await prisma.clanMember.findUnique({ where: { userId_clanId: { userId: a.u.id, clanId: clan.id } } })).not.toBeNull();
  });
});

describe("Important 5 y 6: stale por instante, y applied devuelve la fila del servidor", () => {
  it("base sin milisegundos o con offset sigue siendo la misma fila; applied lleva server.updatedAt", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await owner();
    const id = uuid();
    const created = await (await POST(req("http://t/x", { token, body: { routes: [{ id, notes: "a" }], hops: [] } }), ctx(clan.id))).json();
    const row = await prisma.route.findUniqueOrThrow({ where: { id } });
    expect(created.applied[0].server.updatedAt).toBe(row.updatedAt.toISOString());
    const whole = new Date("2026-09-26T10:00:00.000Z");
    await prisma.route.update({ where: { id }, data: { updatedAt: whole } });
    const noMs = await (await POST(req("http://t/x", { token, body: { routes: [{ id, notes: "b", baseUpdatedAt: "2026-09-26T10:00:00Z" }], hops: [] } }), ctx(clan.id))).json();
    expect(noMs.rejected).toHaveLength(0);
    await prisma.route.update({ where: { id }, data: { updatedAt: whole } });
    const offset = await (await POST(req("http://t/x", { token, body: { routes: [{ id, notes: "c", baseUpdatedAt: "2026-09-26T12:00:00.000+02:00" }], hops: [] } }), ctx(clan.id))).json();
    expect(offset.rejected).toHaveLength(0);
    expect((await prisma.route.findUniqueOrThrow({ where: { id } })).notes).toBe("c");
  });
});

describe("Privacidad del enlace de ver", () => {
  it("la respuesta pública no expone usuario, apodo ni avatar de Discord de quien creó las rutas", async () => {
    const { GET } = await import("@/app/api/v1/shares/[token]/route");
    const { u, clan } = await owner();
    const z = await prisma.zone.findMany({ where: { name: { in: ["Casitos-Atinaum", "Hiles-Izizaum"] } } });
    await prisma.route.create({ data: { clanId: clan.id, createdById: u.id, hops: { create: [{ order: 0, fromZoneId: z[0].id, toZoneId: z[1].id, portalSize: 7, expiresAt: new Date(Date.now() + 3600e3) }] } } });
    const s = await shares.createShare(clan.id, "VIEWER", u.id);
    const body = await (await GET(req("http://t/x", { ip: "10.7.7.9" }), { params: Promise.resolve({ token: s.token }) })).json();
    const text = JSON.stringify(body);
    expect(text).not.toContain(u.discordUsername);
    expect(text).not.toContain(u.globalNickname!);
    expect(body.routes[0].createdBy.discordAvatar).toBeNull();
  });
});
