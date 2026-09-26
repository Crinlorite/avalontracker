import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { verifyDeviceToken } from "@/lib/device-tokens";
import { mergeGuestInto } from "@/lib/guest";

const schema = z.object({ guestToken: z.string().min(10).max(200) }).strict();

// Desde la app: la cuenta Discord (Bearer) absorbe al invitado cuyo token
// se envía en el cuerpo. Exige los DOS tokens válidos (spec §5.2, flujo 3).
export async function POST(req: Request) {
  const me = await getApiUser(req);
  if (!me || me.via !== "device") return apiError("UNAUTHORIZED", 401, "Hace falta el token de dispositivo de la cuenta Discord");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const target = await prisma.user.findUnique({ where: { id: me.userId }, select: { isGuest: true } });
    if (!target || target.isGuest) return apiError("INSUFFICIENT_ROLE", 403, "Entra con Discord para conservar los mapas");
    const guest = await verifyDeviceToken(parsed.data.guestToken);
    if (!guest) return apiError("VALIDATION_ERROR", 400, "Token de invitado no válido");
    const maps = await mergeGuestInto(guest.userId, me.userId);
    const stillGuest = await prisma.user.findUnique({ where: { id: guest.userId }, select: { isGuest: true } });
    if (stillGuest) return apiError("VALIDATION_ERROR", 400, "Ese token no es de una cuenta de invitado");
    return NextResponse.json({ merged: true, maps });
  } catch (err) { return internalError(err); }
}
