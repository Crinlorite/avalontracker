import { auth } from "@/lib/auth";
import { verifyDeviceToken } from "@/lib/device-tokens";
import { apiError } from "@/lib/api-error";
import { createLimiter, consumeToken, type Limiter } from "@/lib/rate-limit";
import type { NextResponse } from "next/server";

export type ApiUser = { userId: string; via: "session" | "device"; deviceId?: string };

// /api/v1: token de dispositivo (Bearer) o sesión web. Si viene un Bearer
// y no es válido, NO se cae a la sesión: se rechaza.
export async function getApiUser(req: Request): Promise<ApiUser | null> {
  const h = req.headers.get("authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) {
    const v = await verifyDeviceToken(h.slice(7).trim());
    return v ? { userId: v.userId, via: "device", deviceId: v.deviceId } : null;
  }
  const session = await auth();
  return session?.user?.id ? { userId: session.user.id, via: "session" } : null;
}

// Límite general de /api/v1: 600 peticiones por hora y dispositivo (o por
// usuario si entra con sesión web) — spec §10.
const apiLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 600 });

export function apiRateLimit(me: ApiUser, limiter: Limiter = apiLimiter): NextResponse | null {
  const key = me.via === "device" ? `d:${me.deviceId}` : `u:${me.userId}`;
  const r = consumeToken(limiter, key);
  return r.ok ? null : apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: r.retryAfterMs });
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
