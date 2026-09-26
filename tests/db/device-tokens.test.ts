// Tokens de dispositivo, códigos de vínculo y getApiUser (plan fase 1, Tarea 3).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-device-tokens-0123456789";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let dt: typeof import("@/lib/device-tokens");
let apiAuth: typeof import("@/lib/api-auth");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  dt = await import("@/lib/device-tokens");
  apiAuth = await import("@/lib/api-auth");
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
const user = () => prisma.user.create({ data: { discordId: `2000000000000000${++seq}`.slice(0, 18), discordUsername: `d${seq}`, email: `d${seq}@x.test` } });

describe("tokens de dispositivo", () => {
  it("crea, verifica y solo guarda el hash", async () => {
    const u = await user();
    const { token, deviceId } = await dt.createDeviceToken(u.id, "iPhone");
    expect(token.startsWith("avt_")).toBe(true);
    expect(await dt.verifyDeviceToken(token)).toEqual({ userId: u.id, deviceId });
    const row = await prisma.deviceToken.findUniqueOrThrow({ where: { id: deviceId } });
    expect(row.tokenHash).not.toContain(token.slice(4, 20));
  });
  it("rechaza manipulado, desconocido, vacío y revocado", async () => {
    const u = await user();
    const { token, deviceId } = await dt.createDeviceToken(u.id, "x");
    expect(await dt.verifyDeviceToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await dt.verifyDeviceToken("avt_" + "x".repeat(43))).toBeNull();
    expect(await dt.verifyDeviceToken("")).toBeNull();
    expect(await dt.revokeDeviceToken(u.id, deviceId)).toBe(true);
    expect(await dt.verifyDeviceToken(token)).toBeNull();
    expect(await dt.listDeviceTokens(u.id)).toHaveLength(0);
  });
  it("no deja revocar el dispositivo de otro usuario", async () => {
    const a = await user(); const b = await user();
    const { deviceId } = await dt.createDeviceToken(a.id, "x");
    expect(await dt.revokeDeviceToken(b.id, deviceId)).toBe(false);
    expect(await dt.listDeviceTokens(a.id)).toHaveLength(1);
  });
});

describe("códigos de vínculo", () => {
  it("válido una sola vez, dentro de 60 s", () => {
    const code = dt.signLinkCode("cuser1234567890abcdef");
    expect(dt.consumeLinkCode(code)).toBe("cuser1234567890abcdef");
    expect(dt.consumeLinkCode(code)).toBeNull();
  });
  it("rechaza caducado, firma falsa y formato raro", () => {
    expect(dt.consumeLinkCode(dt.signLinkCode("cuser1234567890abcdef", Date.now() - 61_000))).toBeNull();
    const good = dt.signLinkCode("cuser1234567890abcdef");
    const [id, exp, nonce, sig] = good.split(".");
    expect(dt.consumeLinkCode(`cother1234567890abcde.${exp}.${nonce}.${sig}`)).toBeNull();
    expect(dt.consumeLinkCode(`${id}.${exp}.${nonce}.${"0".repeat(64)}`)).toBeNull();
    for (const bad of ["", "a.b.c", "a.b.c.d.e", "x".repeat(600)]) expect(dt.consumeLinkCode(bad)).toBeNull();
    expect(dt.consumeLinkCode(undefined)).toBeNull();
  });
});

describe("getApiUser", () => {
  it("Bearer válido → dispositivo; Bearer inválido → null aunque haya sesión; sin Bearer → sesión", async () => {
    const u = await user();
    const { token, deviceId } = await dt.createDeviceToken(u.id, "x");
    session.current = { user: { id: "csession000000000000000" } };
    expect(await apiAuth.getApiUser(new Request("http://t/", { headers: { authorization: `Bearer ${token}` } }))).toEqual({ userId: u.id, via: "device", deviceId });
    expect(await apiAuth.getApiUser(new Request("http://t/", { headers: { authorization: "Bearer avt_nope" } }))).toBeNull();
    expect(await apiAuth.getApiUser(new Request("http://t/"))).toEqual({ userId: "csession000000000000000", via: "session" });
    session.current = null;
    expect(await apiAuth.getApiUser(new Request("http://t/"))).toBeNull();
  });
});
