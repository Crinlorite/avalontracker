import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return apiError("NOT_FOUND", 404, "Usuario no encontrado");
  // tier solo se incluye para usuarios owner — el resto recibe la respuesta
  // sin el campo. Así nada en el bundle del cliente revela la existencia del
  // tier privilegiado.
  return NextResponse.json({
    id: user.id,
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    globalNickname: user.globalNickname,
    displayName: user.displayName,
    image: user.image,
    ...(user.isSuperAdmin ? { tier: "owner" as const } : {}),
  });
}

const patchSchema = z.object({ displayName: z.string().min(1).max(40).nullable() });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  await prisma.user.update({ where: { id: session.user.id }, data: { displayName: parsed.data.displayName } });
  return NextResponse.json({ ok: true });
}
