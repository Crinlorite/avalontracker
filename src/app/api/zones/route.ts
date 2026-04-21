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

  const zones = await prisma.zone.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 20,
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true },
  });
  return NextResponse.json(zones);
}
