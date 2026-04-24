import { authenticateIngest } from "@/lib/ingest-token";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Identidad resuelta para endpoints de ingesta.
// targetClanId puede ser null si el user está logueado pero no tiene
// clanes asociados — el endpoint decide qué hacer (ej. 400).
export type IngestIdentity =
  | { ok: true; via: "bearer"; userId: string; targetClanId: string; tokenId?: string }
  | { ok: true; via: "session"; userId: string; targetClanId: string | null }
  | { ok: false; reason: "missing" | "invalid" | "revoked" | "no-clan" };

// Identifica al requester vía Bearer primero (Loot Vigil desktop client)
// y luego fallback a NextAuth session cookie (extension Chrome).
//
// Bearer: targetClanId viene del IngestToken (ya amarrado a un clan concreto).
// Session: resolvemos el clan del user "más activo" — el más reciente con
//   rol != null. Si tiene varios clanes, el más recientemente actualizado.
//   El extension puede pasar `X-Target-Clan-Id` header para override explícito.
export async function authenticateIngestRequest(request: Request): Promise<IngestIdentity> {
  // 1. Bearer token — prioridad.
  const header = request.headers.get("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    const bearerAuth = await authenticateIngest(request);
    if (!bearerAuth.ok) return { ok: false, reason: bearerAuth.reason };
    return {
      ok: true,
      via: "bearer",
      userId: bearerAuth.userId,
      targetClanId: bearerAuth.targetClanId,
      tokenId: bearerAuth.tokenId,
    };
  }

  // 2. Fallback: NextAuth session cookie (extension Chrome con credentials:'include').
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: "missing" };

  const override = request.headers.get("x-target-clan-id");
  if (override) {
    const clan = await prisma.clan.findFirst({
      where: {
        id: override,
        members: { some: { userId: session.user.id, appRole: { not: null } } },
      },
      select: { id: true },
    });
    if (!clan) return { ok: false, reason: "no-clan" };
    return { ok: true, via: "session", userId: session.user.id, targetClanId: clan.id };
  }

  // Sin override: resolvemos al clan más reciente del user.
  const member = await prisma.clanMember.findFirst({
    where: { userId: session.user.id, appRole: { not: null } },
    orderBy: { clan: { updatedAt: "desc" } },
    select: { clanId: true },
  });
  if (!member) return { ok: false, reason: "no-clan" };
  return { ok: true, via: "session", userId: session.user.id, targetClanId: member.clanId };
}
