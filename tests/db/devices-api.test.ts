// Endpoints /api/v1/devices*, /api/v1/guest, /api/v1/me, /api/v1/me/merge (plan fase 1, Tarea 4).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-devices-api-0123456789ab";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
const discordUser = () => prisma.user.create({ data: { discordId: `3000000000000000${++seq}`.slice(0, 18), discordUsername: `d${seq}`, email: `d${seq}@x.test` } });
const json = (url: string, body?: unknown, headers: Record<string, string> = {}, method = "POST") =>
  new Request(url, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${seq}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("vincular dispositivo", () => {
  it("link → claim → el token vale; el código no se reutiliza; código falso → 400", async () => {
    const { POST: link } = await import("@/app/api/v1/devices/link/route");
    const { POST: claim } = await import("@/app/api/v1/devices/claim/route");
    const { GET: list } = await import("@/app/api/v1/devices/route");
    const u = await discordUser(); session.current = { user: { id: u.id } };
    const { code } = await (await link(json("http://t/api/v1/devices/link"))).json();
    session.current = null;
    const r = await claim(json("http://t/api/v1/devices/claim", { code, deviceName: "Pixel" }));
    expect(r.status).toBe(200);
    const { token, userId, isGuest } = await r.json();
    expect(userId).toBe(u.id); expect(isGuest).toBe(false);
    expect((await claim(json("http://t/api/v1/devices/claim", { code, deviceName: "otra vez" }))).status).toBe(400);
    expect((await claim(json("http://t/api/v1/devices/claim", { code: "a.b.c.d", deviceName: "x" }))).status).toBe(400);
    const devices = await (await list(json("http://t/api/v1/devices", undefined, { authorization: `Bearer ${token}` }, "GET"))).json();
    expect(devices.devices.map((d: { name: string }) => d.name)).toEqual(["Pixel"]);
  });

  it("revocar deja el token muerto; revocar el de otro → 404", async () => {
    const { DELETE: revoke } = await import("@/app/api/v1/devices/[id]/route");
    const { GET: list } = await import("@/app/api/v1/devices/route");
    const dt = await import("@/lib/device-tokens");
    const a = await discordUser(); const b = await discordUser();
    const ta = await dt.createDeviceToken(a.id, "A"); const tb = await dt.createDeviceToken(b.id, "B");
    expect((await revoke(json("http://t/x", undefined, { authorization: `Bearer ${tb.token}` }, "DELETE"), { params: Promise.resolve({ id: ta.deviceId }) })).status).toBe(404);
    expect((await revoke(json("http://t/x", undefined, { authorization: `Bearer ${ta.token}` }, "DELETE"), { params: Promise.resolve({ id: ta.deviceId }) })).status).toBe(204);
    expect((await list(json("http://t/x", undefined, { authorization: `Bearer ${ta.token}` }, "GET"))).status).toBe(401);
  });
});

describe("invitado y fusión desde la app", () => {
  it("POST /guest crea invitado con token; /me lo describe", async () => {
    const { POST: guest } = await import("@/app/api/v1/guest/route");
    const { GET: me } = await import("@/app/api/v1/me/route");
    const r = await guest(json("http://t/api/v1/guest", { deviceName: "iPhone" }));
    expect(r.status).toBe(201);
    const { token, isGuest } = await r.json(); expect(isGuest).toBe(true);
    const m = await (await me(json("http://t/x", undefined, { authorization: `Bearer ${token}` }, "GET"))).json();
    expect(m.isGuest).toBe(true);
  });

  it("merge pasa los mapas del invitado a la cuenta Discord y mata su token; un invitado no puede ser destino", async () => {
    const { POST: guest } = await import("@/app/api/v1/guest/route");
    const { POST: merge } = await import("@/app/api/v1/me/merge/route");
    const { GET: me } = await import("@/app/api/v1/me/route");
    const dt = await import("@/lib/device-tokens");
    const g = await (await guest(json("http://t/api/v1/guest", { deviceName: "iPhone" }))).json();
    const clan = await prisma.clan.create({ data: { name: `g-${seq}`, kind: "PERSONAL", createdById: g.userId } });
    await prisma.clanMember.create({ data: { userId: g.userId, clanId: clan.id, appRole: "ADMIN" } });
    const d = await discordUser(); const td = await dt.createDeviceToken(d.id, "D");
    // Un invitado como destino → 403.
    const g2 = await (await guest(json("http://t/api/v1/guest", { deviceName: "otro" }))).json();
    expect((await merge(json("http://t/x", { guestToken: g.token }, { authorization: `Bearer ${g2.token}` }))).status).toBe(403);
    const ok = await merge(json("http://t/x", { guestToken: g.token }, { authorization: `Bearer ${td.token}` }));
    expect(ok.status).toBe(200); expect((await ok.json()).maps).toBe(1);
    expect((await prisma.clan.findUniqueOrThrow({ where: { id: clan.id } })).createdById).toBe(d.id);
    expect((await me(json("http://t/x", undefined, { authorization: `Bearer ${g.token}` }, "GET"))).status).toBe(401);
    // Repetir con un token que ya no es de invitado → 400.
    expect((await merge(json("http://t/x", { guestToken: td.token }, { authorization: `Bearer ${td.token}` }))).status).toBe(400);
  });
});
