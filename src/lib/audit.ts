import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type AuditAction =
  | "CLAN_CREATE" | "CLAN_UPDATE" | "CLAN_DELETE"
  | "MEMBER_ROLE_SYNCED" | "MEMBER_LEFT"
  | "ROUTE_CREATE" | "ROUTE_UPDATE" | "ROUTE_DISABLE" | "ROUTE_DELETE"
  | "HOP_STATUS_CHANGED" | "HOP_EXTENDED" | "HOP_DELETE"
  | "SETTINGS_CHANGE" | "ROLE_MAPPING_CHANGE" | "WEBHOOK_UPDATE"
  | "DISCORD_LOGIN_FIRST";

export async function logAudit(
  clanId: string,
  userId: string,
  action: AuditAction,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (user?.isSuperAdmin) {
    const member = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { appRole: true },
    });
    if (!member || member.appRole === null) {
      return;
    }
  }
  await prisma.auditLog.create({
    data: {
      clanId,
      userId,
      action,
      targetId: targetId ?? null,
      details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
