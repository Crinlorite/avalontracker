import { prisma } from "./prisma";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_EXPIRY_HOURS = 24;

export function generateCodeString(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  // Format: XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createInviteCode(userId: string) {
  // Invalidar códigos anteriores pendientes del usuario
  await prisma.inviteCode.updateMany({
    where: { userId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  let code: string;
  let exists = true;

  // Generar código único
  do {
    code = generateCodeString();
    const found = await prisma.inviteCode.findUnique({ where: { code } });
    exists = !!found;
  } while (exists);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CODE_EXPIRY_HOURS);

  return prisma.inviteCode.create({
    data: {
      code,
      userId,
      expiresAt,
    },
  });
}

export async function resolveInviteCode(code: string) {
  const invite = await prisma.inviteCode.findUnique({
    where: { code },
    include: {
      user: {
        select: { id: true, displayName: true, image: true },
      },
    },
  });

  if (!invite) return { error: "Código no encontrado" };
  if (invite.status === "USED") return { error: "Código ya utilizado" };
  if (invite.status === "EXPIRED" || invite.expiresAt < new Date()) {
    return { error: "Código expirado" };
  }

  return { invite };
}

export async function consumeInviteCode(
  code: string,
  clanId: string,
  officerId: string
) {
  const { invite, error } = await resolveInviteCode(code);
  if (error || !invite) return { error };

  // Verificar que el usuario no sea ya miembro
  const existing = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId: invite.userId, clanId } },
  });
  if (existing) return { error: "Este usuario ya es miembro del clan" };

  // Transacción: marcar código como usado + agregar miembro
  const [, member] = await prisma.$transaction([
    prisma.inviteCode.update({
      where: { id: invite.id },
      data: { status: "USED", usedAt: new Date(), clanId },
    }),
    prisma.clanMember.create({
      data: {
        userId: invite.userId,
        clanId,
        role: "MEMBER",
        invitedById: officerId,
      },
    }),
  ]);

  return { member, user: invite.user };
}
