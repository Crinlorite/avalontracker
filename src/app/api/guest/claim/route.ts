import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { CLAIM_COOKIE, signClaim } from "@/lib/guest";

// Paso previo a «entrar con Discord» desde una sesión de invitado: deja
// una cookie firmada (10 min) con el id del invitado. El callback de
// Discord la verifica y pasa sus mapas a la cuenta real (lib/auth.ts).
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isGuest: true } });
  if (!user?.isGuest) return apiError("VALIDATION_ERROR", 400, "Solo para cuentas de invitado");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CLAIM_COOKIE, signClaim(session.user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
