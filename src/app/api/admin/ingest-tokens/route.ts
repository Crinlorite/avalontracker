import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { generateToken } from "@/lib/ingest-token";

// Solo super admin puede listar / crear / revocar ingest tokens.
async function requireSuperAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  return u?.isSuperAdmin === true;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  if (!(await requireSuperAdmin(session.user.id))) return apiError("INSUFFICIENT_ROLE", 403, "Solo super admin");

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
  targetClanId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  if (!(await requireSuperAdmin(session.user.id))) return apiError("INSUFFICIENT_ROLE", 403, "Solo super admin");

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

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
    // El raw se devuelve SOLO aquí, una vez. Después solo el hash queda en BD.
    return NextResponse.json(
      { id: created.id, label: created.label, raw, targetClanId: created.targetClanId },
      { status: 201 },
    );
  } catch (err) {
    return internalError(err);
  }
}
