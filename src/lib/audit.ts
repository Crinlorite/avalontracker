import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type AuditAction =
  | "CLAN_CREATE" | "CLAN_UPDATE" | "CLAN_DELETE"
  | "MEMBER_ROLE_SYNCED" | "MEMBER_LEFT"
  | "ROUTE_CREATE" | "ROUTE_UPDATE" | "ROUTE_DISABLE" | "ROUTE_DELETE"
  | "HOP_STATUS_CHANGED" | "HOP_EXTENDED" | "HOP_DELETE"
  | "SETTINGS_CHANGE" | "ROLE_MAPPING_CHANGE" | "WEBHOOK_UPDATE"
  | "DISCORD_LOGIN_FIRST";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

export async function logAudit(
  clanId: string,
  userId: string,
  action: AuditAction,
  targetId?: string,
  details?: Record<string, unknown>,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      clanId,
      userId,
      action,
      targetId: targetId ?? null,
      details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
