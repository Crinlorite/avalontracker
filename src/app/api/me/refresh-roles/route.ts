import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRoleCache, getUserRoleInClan } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

const limiter = createLimiter({ windowMs: 60_000, max: 5 });

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const r = consumeToken(limiter, session.user.id);
  if (!r.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: r.retryAfterMs });

  invalidateRoleCache(session.user.id);
  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: session.user.id } } },
    select: { id: true },
  });
  for (const c of clans) await getUserRoleInClan(session.user.id, c.id);

  return NextResponse.json({ ok: true, refreshed: clans.length });
}
