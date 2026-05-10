import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// PATCH /api/clans/[clanId]/anchor-status
//
// Actualiza el estado de seguridad del anchor: nivel (verde/amarillo/
// rojo) + notas libres con nombres, equipos, actividad. Se separa del
// PATCH /clans/[clanId] (ADMIN-only para name/webhook) porque las
// revisiones de seguridad son frecuentes y CUALQUIER CONTRIBUTOR
// debería poder actualizar el parte sin tocar config sensible.
//
// Cada update bumpea anchorNotesAt = now; la UI usa ese timestamp para
// avisar si la info está rancia (>3h sin revisar).

const patchSchema = z
  .object({
    level: z.enum(["SAFE", "CAUTION", "DANGER"]).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine(
    (d) => d.level !== undefined || d.notes !== undefined,
    "Debe enviar al menos level o notes",
  );

type RouteParams = { params: Promise<{ clanId: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRole(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const data: Record<string, unknown> = { anchorNotesAt: new Date() };
  if (parsed.data.level !== undefined) data.anchorSecurityLevel = parsed.data.level;
  if (parsed.data.notes !== undefined) {
    // null o "" → null (limpia las notas). Trim para evitar "  " mágico.
    const trimmed = parsed.data.notes?.trim() ?? null;
    data.anchorNotes = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  const updated = await prisma.clan.update({
    where: { id: clanId },
    data,
    select: {
      id: true,
      anchorSecurityLevel: true,
      anchorNotes: true,
      anchorNotesAt: true,
    },
  });

  await logAudit(clanId, session.user.id, "ANCHOR_STATUS_UPDATE", undefined, {
    level: parsed.data.level,
    notesLength: parsed.data.notes?.length ?? 0,
  });

  return NextResponse.json(updated);
}
