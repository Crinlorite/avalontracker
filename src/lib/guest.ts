import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { signBody, verifySignature } from "@/lib/hmac";

// Cuentas invitadas: permiten usar un mapa personal sin Discord. El
// invitado es un User normal con isGuest=true e identificadores
// sintéticos; la sesión es el mismo JWT de NextAuth (proveedor «guest»).
//
// Reclamar: antes de entrar con Discord, el invitado pide una cookie
// firmada (HMAC con AUTH_SECRET, 10 min) con su id. En el callback de
// Discord se verifica y se pasan sus datos a la cuenta real.

export const CLAIM_COOKIE = "avalon_guest_claim";
const CLAIM_TTL_MS = 10 * 60 * 1000;
// Invitados sin actividad durante este tiempo se borran con sus mapas.
export const GUEST_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado");
  return s;
}

export async function createGuestUser() {
  const tag = crypto.randomBytes(9).toString("base64url");
  return prisma.user.create({
    data: {
      discordId: `guest_${tag}`,
      discordUsername: "Guest",
      email: `guest_${tag}@guest.invalid`,
      isGuest: true,
      lastSeenAt: new Date(),
    },
    select: { id: true, discordUsername: true },
  });
}

export function signClaim(guestId: string, now = Date.now()): string {
  const payload = `${guestId}.${now + CLAIM_TTL_MS}`;
  return `${payload}.${signBody(payload, secret())}`;
}

// Devuelve el id del invitado si la cookie es auténtica y no ha caducado.
export function verifyClaim(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [guestId, exp, sig] = parts;
  if (!/^[a-z0-9]{10,40}$/i.test(guestId) || !/^\d{10,16}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (!verifySignature(`${guestId}.${exp}`, sig, secret())) return null;
  if (Number(exp) < now) return null;
  return guestId;
}

// Pasa todo lo del invitado a la cuenta real y borra el invitado. Solo
// actúa si `guestId` sigue siendo un invitado y es distinto del destino.
// Devuelve cuántos mapas se han pasado (0 si no había nada que hacer).
export async function mergeGuestInto(guestId: string, userId: string): Promise<number> {
  if (guestId === userId) return 0;
  return prisma.$transaction(async (tx) => {
    const guest = await tx.user.findUnique({ where: { id: guestId }, select: { isGuest: true } });
    const target = await tx.user.findUnique({ where: { id: userId }, select: { isGuest: true } });
    if (!guest?.isGuest || !target || target.isGuest) return 0;

    const maps = await tx.clan.updateMany({ where: { createdById: guestId }, data: { createdById: userId } });

    // Membresías: si la cuenta real ya estaba en ese clan, se queda la suya.
    const memberships = await tx.clanMember.findMany({ where: { userId: guestId } });
    for (const m of memberships) {
      const exists = await tx.clanMember.findUnique({ where: { userId_clanId: { userId, clanId: m.clanId } } });
      if (exists) await tx.clanMember.delete({ where: { id: m.id } });
      else await tx.clanMember.update({ where: { id: m.id }, data: { userId } });
    }

    await tx.route.updateMany({ where: { createdById: guestId }, data: { createdById: userId } });
    await tx.route.updateMany({ where: { disabledById: guestId }, data: { disabledById: userId } });
    await tx.routeHop.updateMany({ where: { statusSetById: guestId }, data: { statusSetById: userId } });
    await tx.auditLog.updateMany({ where: { userId: guestId }, data: { userId } });
    await tx.user.delete({ where: { id: guestId } });
    return maps.count;
  });
}

// Borra invitados sin actividad (y sus mapas personales). Actividad =
// lastSeenAt, que se refresca al usar la app (ver touchGuest).
export async function purgeIdleGuests(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - GUEST_IDLE_MS);
  const idle = await prisma.user.findMany({
    where: { isGuest: true, OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }] },
    select: { id: true },
    take: 200,
  });
  for (const { id } of idle) {
    // Borrar el clan arrastra en cascada miembros, rutas, saltos y
    // auditoría. Un invitado solo participa en sus mapas personales.
    await prisma.$transaction([
      prisma.clan.deleteMany({ where: { createdById: id, kind: "PERSONAL" } }),
      prisma.user.delete({ where: { id } }),
    ]);
  }
  return idle.length;
}

// Marca actividad del invitado (como mucho una escritura por hora).
export async function touchGuest(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, isGuest: true, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }] },
    data: { lastSeenAt: new Date() },
  });
}
