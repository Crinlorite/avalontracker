import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { createShare, listShares, ShareError } from "@/lib/map-shares";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ role: z.enum(["VIEWER", "EDITOR"]) }).strict();

export async function GET(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const { id } = await params;
  try {
    await requireRole(me.userId, id, "ADMIN", "GET");
    return NextResponse.json({ shares: await listShares(id) });
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    await requireRole(me.userId, id, "ADMIN", "WRITE");
    const share = await createShare(id, parsed.data.role, me.userId);
    await logAudit(id, me.userId, "SETTINGS_CHANGE", share.id, { share: "create", role: share.role });
    return NextResponse.json(share, { status: 201 });
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    if (e instanceof ShareError) return apiError(e.code === "NOT_FOUND" ? "NOT_FOUND" : e.code === "LIMIT" ? "VALIDATION_ERROR" : "INSUFFICIENT_ROLE", e.status, e.message);
    return internalError(e);
  }
}
