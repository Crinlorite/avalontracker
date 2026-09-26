import { NextResponse } from "next/server";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { revokeDeviceToken } from "@/lib/device-tokens";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const { id } = await params;
  if (!(await revokeDeviceToken(me.userId, id))) return apiError("NOT_FOUND", 404, "Dispositivo no encontrado");
  return new NextResponse(null, { status: 204 });
}
