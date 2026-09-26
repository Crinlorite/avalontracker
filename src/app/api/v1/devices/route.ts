import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { listDeviceTokens } from "@/lib/device-tokens";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  return NextResponse.json({ devices: await listDeviceTokens(me.userId) });
}
