import { prisma } from "./prisma";

export type AuditAction =
  | "CLAN_CREATE"
  | "MEMBER_JOIN"
  | "MEMBER_KICK"
  | "MEMBER_LEAVE"
  | "MEMBER_ROLE_CHANGE"
  | "ROUTE_CREATE"
  | "ROUTE_DISABLE"
  | "ROUTE_DELETE"
  | "CODE_GENERATE"
  | "CODE_RESOLVE"
  | "WEBHOOK_UPDATE"
  | "SETTINGS_CHANGE"
  | "ROUTE_CREATE_EXTERNAL";

export async function logAudit(
  clanId: string,
  userId: string,
  action: AuditAction,
  targetId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>
) {
  return prisma.auditLog.create({
    data: {
      clanId,
      userId,
      action,
      targetId,
      details: details as object | undefined,
    },
  });
}
