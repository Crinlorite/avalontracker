import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { createPersonalMap, MAX_PERSONAL_MAPS } from "@/lib/personal-maps";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: me.userId, appRole: { not: null } } } },
    include: { members: { where: { userId: me.userId }, select: { appRole: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ maps: clans.map((c) => ({ id: c.id, name: c.name, kind: c.kind, myRole: c.members[0]?.appRole ?? null, updatedAt: c.updatedAt.toISOString() })) });
}

const createSchema = z.object({ anchorZone: z.string().min(2).max(60).optional() }).strict();

export async function POST(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const r = await createPersonalMap(me.userId, parsed.data.anchorZone);
    if ("error" in r && r.error === "NO_USER") return apiError("UNAUTHORIZED", 401, "Inicia sesión");
    if ("error" in r) return apiError("VALIDATION_ERROR", 400, `Máximo ${MAX_PERSONAL_MAPS} mapas personales`, { limit: MAX_PERSONAL_MAPS });
    return NextResponse.json(r, { status: 201 });
  } catch (err) { return internalError(err); }
}
