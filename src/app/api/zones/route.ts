import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

const zonesLim = createLimiter({ windowMs: 60_000, max: 60 });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const rl = consumeToken(zonesLim, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas búsquedas", { retryAfterMs: rl.retryAfterMs });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json([]);

  const select = { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true };

  // 1) Prefix matches primero (autocompletado natural — "brid" → Bridgewatch).
  const prefixMatches = await prisma.zone.findMany({
    where: { name: { startsWith: q, mode: "insensitive" } },
    take: 15,
    orderBy: { name: "asc" },
    select,
  });

  // 2) Substring matches rellenando el resto, excluyendo lo que ya salió como prefix.
  const prefixIds = prefixMatches.map((z) => z.id);
  const remaining = 30 - prefixMatches.length;
  const substringMatches = remaining > 0
    ? await prisma.zone.findMany({
        where: {
          name: { contains: q, mode: "insensitive" },
          id: { notIn: prefixIds },
        },
        take: remaining,
        orderBy: { name: "asc" },
        select,
      })
    : [];

  return NextResponse.json([...prefixMatches, ...substringMatches]);
}
