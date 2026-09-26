import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiError, internalError } from "@/lib/api-error";

import { createPersonalMap, MAX_PERSONAL_MAPS } from "@/lib/personal-maps";

// Mapas personales desde la web (sesión). La lógica vive en src/lib/personal-maps.ts.

const createSchema = z.object({
  // Zona de partida opcional (p. ej. desde /zones/<zona>): se usa de ancla.
  anchorZone: z.string().min(2).max(60).optional(),
}).strict();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const r = await createPersonalMap(session.user.id, parsed.data.anchorZone);
    if ("error" in r) return apiError("VALIDATION_ERROR", 400, `Máximo ${MAX_PERSONAL_MAPS} mapas personales`, { limit: MAX_PERSONAL_MAPS });
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    return internalError(err);
  }
}
