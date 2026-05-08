import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return apiError("NOT_FOUND", 404, "Usuario no encontrado");
  return NextResponse.json({
    id: user.id,
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    globalNickname: user.globalNickname,
    displayName: user.displayName,
    image: user.image,
  });
}

// 10/min basta de sobra para uso legítimo (rename humano) y bloquea
// cualquier loop de spam. Trim + .nullable() permite limpiar el campo
// pasando null explícito (= revertir al globalNickname / discordUsername).
const patchLimiter = createLimiter({ windowMs: 60_000, max: 10 });
const patchSchema = z.object({ displayName: z.string().min(1).max(40).nullable() });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const rl = consumeToken(patchLimiter, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  const trimmed = parsed.data.displayName?.trim() ?? null;
  await prisma.user.update({ where: { id: session.user.id }, data: { displayName: trimmed } });
  return NextResponse.json({ ok: true });
}
