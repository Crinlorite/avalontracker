import { prisma } from "./prisma";
import { ClanRole } from "@/generated/prisma/client";

const ROLE_HIERARCHY: Record<ClanRole, number> = {
  OWNER: 3,
  OFFICER: 2,
  MEMBER: 1,
};

export async function getClanMembership(userId: string, clanId: string) {
  return prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId } },
  });
}

export async function requireClanMember(userId: string, clanId: string) {
  const membership = await getClanMembership(userId, clanId);
  if (!membership) {
    throw new Error("No eres miembro de este clan");
  }
  return membership;
}

export async function requireRole(
  userId: string,
  clanId: string,
  minRole: ClanRole
) {
  const membership = await requireClanMember(userId, clanId);
  if (ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[minRole]) {
    throw new Error("No tienes permisos suficientes");
  }
  return membership;
}

export function hasMinRole(userRole: ClanRole, minRole: ClanRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}
