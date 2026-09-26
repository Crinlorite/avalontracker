import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { revokeShare } from "@/lib/map-shares";
import { logAudit } from "@/lib/audit";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id, shareId } = await params;
  try {
    await requireRole(me.userId, id, "ADMIN", "WRITE");
    if (!(await revokeShare(id, shareId))) return apiError("NOT_FOUND", 404, "Enlace no encontrado");
    await logAudit(id, me.userId, "SETTINGS_CHANGE", shareId, { share: "revoke" });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }
}
