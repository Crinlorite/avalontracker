import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { consumeLinkCode, createDeviceToken } from "@/lib/device-tokens";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

const lim = createLimiter({ windowMs: 60_000, max: 10 });
const schema = z.object({ code: z.string().min(1).max(256), deviceName: z.string().min(1).max(60) }).strict();

// Sin autenticación: el código de un solo uso ES la credencial.
export async function POST(req: Request) {
  if (!consumeToken(lim, clientIp(req)).ok) return apiError("RATE_LIMITED", 429, "Demasiados intentos");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const userId = consumeLinkCode(parsed.data.code);
    if (!userId) return apiError("VALIDATION_ERROR", 400, "Código no válido o caducado");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isGuest: true } });
    if (!user) return apiError("VALIDATION_ERROR", 400, "Código no válido o caducado");
    const { token, deviceId } = await createDeviceToken(user.id, parsed.data.deviceName);
    return NextResponse.json({ token, deviceId, userId: user.id, isGuest: user.isGuest });
  } catch (err) { return internalError(err); }
}
