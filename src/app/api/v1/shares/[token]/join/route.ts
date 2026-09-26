import { NextResponse } from "next/server";
import { apiRateLimit, getApiUser, clientIp } from "@/lib/api-auth";
import { consumeToken, peekBlocked } from "@/lib/rate-limit";
import { shareLookupLimiter } from "@/lib/map-shares";
import { apiError, internalError } from "@/lib/api-error";
import { joinByShare } from "@/lib/map-shares";
import { touchGuest } from "@/lib/guest";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const { token } = await params;
  const ip = clientIp(req);
  if (peekBlocked(shareLookupLimiter, ip)) return apiError("RATE_LIMITED", 429, "Demasiados intentos");
  try {
    const joined = await joinByShare(token, me.userId);
    if (!joined) { consumeToken(shareLookupLimiter, ip); return apiError("NOT_FOUND", 404, "Enlace no válido"); }
    await touchGuest(me.userId);
    await logAudit(joined.clanId, me.userId, "MEMBER_ROLE_SYNCED", undefined, { via: "share", role: joined.role });
    return NextResponse.json(joined);
  } catch (e) { return internalError(e); }
}
