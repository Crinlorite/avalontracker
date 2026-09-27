// Borrar una cuenta a petición (scripts/delete-account.ts; sección «Borrar tu cuenta» de /legal/privacy).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb } from "./setup";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
async function user(name: string) {
  seq++;
  return prisma.user.create({ data: { discordId: `2000000000000000${seq}`.slice(0, 18), discordUsername: name, displayName: name, email: `${name}@x.test` } });
}
async function zones() {
  return Promise.all(["Casitos-Atinaum", "Hiles-Izizaum"].map((name) =>
    prisma.zone.upsert({ where: { name }, create: { name, type: "AVALON", tier: 6 }, update: {} })));
}
async function route(clanId: string, createdById: string, statusSetById?: string) {
  const [a, b] = await zones();
  return prisma.route.create({ data: { clanId, createdById, disabledById: statusSetById ?? null, hops: { create: [
    { order: 0, fromZoneId: a.id, toZoneId: b.id, portalSize: 7, expiresAt: new Date(Date.now() + 3600e3), statusSetById: statusSetById ?? null },
  ] } }, include: { hops: true } });
}

async function scenario() {
  const ana = await user(`ana${seq}`);
  const bea = await user(`bea${seq}`);
  await prisma.deviceToken.create({ data: { userId: ana.id, name: "Pixel", tokenHash: `h-${ana.id}` } });
  // Mapa personal de Ana, con una ruta de Bea añadida por enlace de edición.
  const personal = await prisma.clan.create({ data: { name: `personal-${ana.id}`, kind: "PERSONAL", createdById: ana.id } });
  await prisma.mapShare.create({ data: { clanId: personal.id, role: "CONTRIBUTOR", tokenHash: `s-${ana.id}`, createdById: ana.id } });
  const bInPersonal = await route(personal.id, bea.id);
  // Mapa de clan de Discord creado por Ana, donde las dos aportan.
  const guild = await prisma.clan.create({ data: { name: `guild-${ana.id}`, kind: "DISCORD", discordGuildId: `g-${ana.id}`, createdById: ana.id } });
  for (const u of [ana, bea]) await prisma.clanMember.create({ data: { userId: u.id, clanId: guild.id, appRole: "CONTRIBUTOR", roleSource: "test" } });
  const aInGuild = await route(guild.id, ana.id, ana.id);
  const bInGuild = await route(guild.id, bea.id);
  await prisma.mapShare.create({ data: { clanId: guild.id, role: "VIEWER", tokenHash: `sg-${ana.id}`, createdById: ana.id } });
  await prisma.auditLog.create({ data: { clanId: guild.id, userId: ana.id, action: "ROUTE_CREATE", targetId: aInGuild.id } });
  return { ana, bea, personal, bInPersonal, guild, aInGuild, bInGuild };
}

describe("deleteAccount", () => {
  it("borra la cuenta, sus dispositivos, sus membresías y sus mapas personales enteros", async () => {
    const { deleteAccount } = await import("../../scripts/delete-account");
    const s = await scenario();
    await deleteAccount(prisma, s.ana.id);
    expect(await prisma.user.findUnique({ where: { id: s.ana.id } })).toBeNull();
    expect(await prisma.deviceToken.count({ where: { userId: s.ana.id } })).toBe(0);
    expect(await prisma.clanMember.count({ where: { userId: s.ana.id } })).toBe(0);
    expect(await prisma.clan.findUnique({ where: { id: s.personal.id } })).toBeNull();
    expect(await prisma.route.findUnique({ where: { id: s.bInPersonal.id } })).toBeNull();
  });

  it("lo aportado a un mapa de clan se queda para el clan, a nombre de «usuario eliminado»", async () => {
    const { deleteAccount, DELETED_USER_DISCORD_ID } = await import("../../scripts/delete-account");
    const s = await scenario();
    await deleteAccount(prisma, s.ana.id);
    const ghost = await prisma.user.findUniqueOrThrow({ where: { discordId: DELETED_USER_DISCORD_ID } });
    expect(ghost.email).not.toContain(s.ana.discordUsername);
    const guild = await prisma.clan.findUniqueOrThrow({ where: { id: s.guild.id } });
    expect(guild.createdById).toBe(ghost.id);
    const kept = await prisma.route.findUniqueOrThrow({ where: { id: s.aInGuild.id }, include: { hops: true } });
    expect([kept.createdById, kept.disabledById, kept.hops[0].statusSetById]).toEqual([ghost.id, ghost.id, ghost.id]);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: s.bInGuild.id } })).createdById).toBe(s.bea.id);
    expect(await prisma.auditLog.count({ where: { userId: s.ana.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { clanId: s.guild.id, userId: ghost.id } })).toBe(1);
    expect(await prisma.mapShare.count({ where: { createdById: s.ana.id } })).toBe(0);
  });

  it("reutiliza el mismo «usuario eliminado» en cada borrado y nunca lo borra a él", async () => {
    const { deleteAccount, DELETED_USER_DISCORD_ID } = await import("../../scripts/delete-account");
    await deleteAccount(prisma, (await scenario()).ana.id);
    await deleteAccount(prisma, (await scenario()).ana.id);
    expect(await prisma.user.count({ where: { discordId: DELETED_USER_DISCORD_ID } })).toBe(1);
    const ghost = await prisma.user.findUniqueOrThrow({ where: { discordId: DELETED_USER_DISCORD_ID } });
    await expect(deleteAccount(prisma, ghost.id)).rejects.toThrow();
  });
});
