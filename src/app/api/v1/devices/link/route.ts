import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { signLinkCode } from "@/lib/device-tokens";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

const lim = createLimiter({ windowMs: 60_000, max: 10 });

// Solo con sesión web: el QR se enseña en Perfil (spec §5.2, flujo 1).
export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  if (!consumeToken(lim, session.user.id).ok) return apiError("RATE_LIMITED", 429, "Demasiados códigos");
  return NextResponse.json({ code: signLinkCode(session.user.id), expiresAt: new Date(Date.now() + 60_000).toISOString() });
}
