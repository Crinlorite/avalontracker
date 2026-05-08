import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { generateToken } from "@/lib/ingest-token";
import { requireRole, PermissionError } from "@/lib/permissions";

// GET /api/me/ingest-tokens — lista los tokens del user autenticado
// a través de todos los clanes donde tiene rol (aunque el token sólo lo
// ve su dueño, se filtra por session.user.id).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const tokens = await prisma.ingestToken.findMany({
    where: { userId: session.user.id },
    include: { targetClan: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    tokens.map((t) => ({
      id: t.id,
      label: t.label,
      targetClan: t.targetClan,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      revokedAt: t.revokedAt,
    })),
  );
}

const createSchema = z.object({
  label: z.string().min(1).max(60),
  targetClanId: z.string().regex(/^c[a-z0-9]{20,30}$/, "ID de clan inválido"),
});

// POST /api/me/ingest-tokens — crear token. El user debe ser ADMIN del clan
// destino para emitir tokens que ingestarán datos en ese clan.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  // Gate: solo ADMIN del clan puede emitir tokens que ingestan en ese clan.
  try {
    await requireRole(session.user.id, parsed.data.targetClanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos en ese clan", e.extra);
    return internalError(e);
  }

  const clan = await prisma.clan.findUnique({ where: { id: parsed.data.targetClanId } });
  if (!clan) return apiError("NOT_FOUND", 404, "Clan no encontrado");

  try {
    const { raw, hash } = generateToken();
    const created = await prisma.ingestToken.create({
      data: {
        userId: session.user.id,
        targetClanId: parsed.data.targetClanId,
        tokenHash: hash,
        label: parsed.data.label,
      },
    });
    return NextResponse.json(
      { id: created.id, label: created.label, raw, targetClanId: created.targetClanId },
      { status: 201 },
    );
  } catch (err) {
    return internalError(err);
  }
}
