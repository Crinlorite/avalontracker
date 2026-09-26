import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { createGuestUser } from "@/lib/guest";
import { createDeviceToken } from "@/lib/device-tokens";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

// Invitado desde la app, sin pasar por la web (spec §5.2, flujo 2).
// Mismo límite que las altas de invitado de la web: 5 por IP y hora.
const lim = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
const schema = z.object({ deviceName: z.string().min(1).max(60) }).strict();

export async function POST(req: Request) {
  if (!consumeToken(lim, clientIp(req)).ok) return apiError("RATE_LIMITED", 429, "Demasiadas cuentas nuevas desde esta red");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const guest = await createGuestUser();
    const { token, deviceId } = await createDeviceToken(guest.id, parsed.data.deviceName);
    return NextResponse.json({ token, deviceId, userId: guest.id, isGuest: true }, { status: 201 });
  } catch (err) { return internalError(err); }
}
