import { NextResponse } from "next/server";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { listDeviceTokens } from "@/lib/device-tokens";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  return NextResponse.json({ devices: await listDeviceTokens(me.userId) });
}
