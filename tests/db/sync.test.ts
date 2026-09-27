// Sincronización por mapa: /api/v1/maps y /changes (plan fase 1, Tarea 6).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

vi.mock("@/lib/vigil-bot-client", () => ({
  fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {},
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
process.env.AUTH_SECRET = "test-secret-for-sync-0123456789abcdefgh";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let dt: typeof import("@/lib/device-tokens");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  dt = await import("@/lib/device-tokens");
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum", "Coros-Atinaum", "Siros-Ofurlos"]) {
    await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} });
  }
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
async function ownerToken() {
  const u = await prisma.user.create({ data: { discordId: `4000000000000000${++seq}`.slice(0, 18), discordUsername: `s${seq}`, email: `s${seq}@x.test` } });
  const clan = await prisma.clan.create({ data: { name: `sync-${seq}`, kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN" } });
  const { token } = await dt.createDeviceToken(u.id, "t");
  return { u, clan, token };
}
const req = (url: string, token: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
  new Request(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const uuid = () => crypto.randomUUID();
const inH = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

describe("sincronización", () => {
  it("quien no es miembro no baja ni sube (403)", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const a = await ownerToken(); const b = await ownerToken();
    expect((await GET(req(`http://t/x`, b.token), ctx(a.clan.id))).status).toBe(403);
    expect((await POST(req(`http://t/x`, b.token, { routes: [{ id: uuid() }], hops: [] }), ctx(a.clan.id))).status).toBe(403);
  });

  it("sube ruta y saltos, baja todo y luego nada desde serverTime", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    const push = await POST(req("http://t/x", token, { routes: [{ id, notes: "hola" }], hops: [
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(2) },
      { routeId: id, fromZone: "Hiles-Izizaum", toZone: "Coros-Atinaum", order: 1, portalSize: 2, expiresAt: inH(3) },
    ] }), ctx(clan.id));
    expect(push.status).toBe(200);
    const pr = await push.json(); expect(pr.applied).toHaveLength(3); expect(pr.rejected).toHaveLength(0);
    const all = await (await GET(req("http://t/x", token), ctx(clan.id))).json();
    expect(all.routes.map((r: { id: string }) => r.id)).toEqual([id]);
    expect(all.hops.map((h: { fromZone: string; portalSize: number }) => [h.fromZone, h.portalSize])).toEqual([["Casitos-Atinaum", 7], ["Hiles-Izizaum", 2]]);
    const none = await (await GET(req(`http://t/x?since=${encodeURIComponent(all.serverTime)}`, token), ctx(clan.id))).json();
    expect(none.routes).toHaveLength(0); expect(none.hops).toHaveLength(0);
  });

  it("el servidor manda: base antigua → stale con la fila del servidor; base correcta → aplicado", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    await POST(req("http://t/x", token, { routes: [{ id, notes: "v1" }], hops: [] }), ctx(clan.id));
    const first = await (await GET(req("http://t/x", token), ctx(clan.id))).json();
    const base = first.routes[0].updatedAt;
    await prisma.route.update({ where: { id }, data: { notes: "web" } });
    const stale = await (await POST(req("http://t/x", token, { routes: [{ id, notes: "móvil", baseUpdatedAt: base }], hops: [] }), ctx(clan.id))).json();
    expect(stale.rejected[0].reason).toBe("stale"); expect(stale.rejected[0].server.notes).toBe("web");
    const ok = await (await POST(req("http://t/x", token, { routes: [{ id, notes: "móvil", baseUpdatedAt: stale.rejected[0].server.updatedAt }], hops: [] }), ctx(clan.id))).json();
    expect(ok.applied).toHaveLength(1);
    expect((await prisma.route.findUniqueOrThrow({ where: { id } })).notes).toBe("móvil");
  });

  it("un salto no se cuela en la ruta de otro mapa", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const a = await ownerToken(); const b = await ownerToken();
    const idA = uuid();
    await POST(req("http://t/x", a.token, { routes: [{ id: idA }], hops: [] }), ctx(a.clan.id));
    const r = await (await POST(req("http://t/x", b.token, { routes: [], hops: [{ routeId: idA, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) }] }), ctx(b.clan.id))).json();
    expect(r.rejected[0].reason).toBe("not_in_map");
    expect(await prisma.routeHop.count({ where: { routeId: idA } })).toBe(0);
  });

  it("dos saltos con la misma clave en un lote → uno solo; reenviar el lote no duplica", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    const batch = { routes: [{ id }], hops: [
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) },
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 20, expiresAt: inH(2) },
    ] };
    expect((await POST(req("http://t/x", token, batch), ctx(clan.id))).status).toBe(200);
    expect((await POST(req("http://t/x", token, batch), ctx(clan.id))).status).toBe(200);
    const hops = await prisma.routeHop.findMany({ where: { routeId: id } });
    expect(hops).toHaveLength(1); expect(hops[0].portalSize).toBe(20);
    expect(await prisma.route.count({ where: { id } })).toBe(1);
  });

  it("dos subidas idénticas a la vez (reintento con la primera en vuelo): las dos 200, sin duplicar", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    for (let round = 0; round < 5; round++) {
      const id = uuid();
      const batch = { routes: [{ id, notes: "doble" }], hops: [
        { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) },
        { routeId: id, fromZone: "Hiles-Izizaum", toZone: "Coros-Atinaum", order: 1, portalSize: 20, expiresAt: inH(2) },
      ] };
      const [a, b] = await Promise.all([POST(req("http://t/x", token, batch), ctx(clan.id)), POST(req("http://t/x", token, batch), ctx(clan.id))]);
      expect([a.status, b.status]).toEqual([200, 200]);
      // Cada fila queda aplicada en una y, en la otra, aplicada o rechazada como stale con la fila del servidor.
      for (const r of [await a.json(), await b.json()]) {
        expect(r.applied.length + r.rejected.length).toBe(3);
        for (const x of r.rejected) { expect(x.reason).toBe("stale"); expect(x.server).toBeTruthy(); }
      }
      expect(await prisma.route.count({ where: { id } })).toBe(1);
      expect(await prisma.routeHop.count({ where: { routeId: id } })).toBe(2);
    }
  });

  it("since inválido o futuro → 400; zona desconocida → 400; paginación con limit", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    expect((await GET(req("http://t/x?since=ayer", token), ctx(clan.id))).status).toBe(400);
    expect((await GET(req(`http://t/x?since=${encodeURIComponent(inH(1))}`, token), ctx(clan.id))).status).toBe(400);
    const id = uuid();
    expect((await POST(req("http://t/x", token, { routes: [{ id }], hops: [{ routeId: id, fromZone: "Nope-Zone", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) }] }), ctx(clan.id))).status).toBe(400);
    for (let i = 0; i < 3; i++) await POST(req("http://t/x", token, { routes: [{ id: uuid(), notes: `r${i}` }], hops: [] }), ctx(clan.id));
    const page = await (await GET(req("http://t/x?limit=2", token), ctx(clan.id))).json();
    expect(page.hasMore).toBe(true); expect(page.routes.length).toBeLessThanOrEqual(2); expect(typeof page.next).toBe("string");
    const rest = await (await GET(req(`http://t/x?limit=2&since=${encodeURIComponent(page.next)}`, token), ctx(clan.id))).json();
    // 3 rutas en total (la del push con zona desconocida no se crea): las tres llegan, sin perder ni repetir la del corte.
    const ids = [...page.routes, ...rest.routes].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toHaveLength(3);
  });

  it("paginación: más de limit filas en el mismo instante (caducidad en bloque) no se pierden", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    await POST(req("http://t/x", token, { routes: [{ id }], hops: [
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) },
      { routeId: id, fromZone: "Hiles-Izizaum", toZone: "Coros-Atinaum", order: 1, portalSize: 7, expiresAt: inH(1) },
      { routeId: id, fromZone: "Coros-Atinaum", toZone: "Siros-Ofurlos", order: 2, portalSize: 7, expiresAt: inH(1) },
    ] }), ctx(clan.id));
    // Como el paso a EXPIRED de la web: un solo updateMany, un solo updatedAt para los tres saltos.
    const now = new Date();
    await prisma.routeHop.updateMany({ where: { routeId: id }, data: { deletedAt: now, updatedAt: now } });
    const hops = new Set<number>();
    let since: string | null = null;
    for (let i = 0; i < 10; i++) {
      const url = `http://t/x?limit=2${since ? `&since=${encodeURIComponent(since)}` : ""}`;
      const page: { hops: { id: number; deletedAt: string | null }[]; hasMore: boolean; next: string | null } = await (await GET(req(url, token), ctx(clan.id))).json();
      for (const h of page.hops) { expect(h.deletedAt).toBe(now.toISOString()); hops.add(h.id); }
      if (!page.hasMore) break;
      since = page.next;
    }
    expect(hops.size).toBe(3);
  });

  it("listar y crear mapas por API", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/route");
    const { clan, token } = await ownerToken();
    const list = await (await GET(req("http://t/x", token))).json();
    expect(list.maps.map((m: { id: string }) => m.id)).toContain(clan.id);
    expect((await POST(req("http://t/x", token, {}))).status).toBe(201);
  });
});
