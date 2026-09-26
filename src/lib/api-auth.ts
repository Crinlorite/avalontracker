import { auth } from "@/lib/auth";
import { verifyDeviceToken } from "@/lib/device-tokens";

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

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
