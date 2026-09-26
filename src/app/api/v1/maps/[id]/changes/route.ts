import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { pullChanges, applyChanges, pushSchema, UnknownZoneError, PULL_LIMIT } from "@/lib/sync";
import { touchGuest } from "@/lib/guest";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  const url = new URL(req.url);
  let since: Date | null = null;
  const s = url.searchParams.get("since");
  if (s !== null) {
    since = new Date(s);
    if (Number.isNaN(since.getTime()) || since.getTime() > Date.now() + 60_000) return apiError("VALIDATION_ERROR", 400, "since inválido");
  }
  const limitRaw = Number(url.searchParams.get("limit") ?? PULL_LIMIT);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= PULL_LIMIT ? limitRaw : PULL_LIMIT;
  try {
    await requireRole(me.userId, id, "VIEWER", "GET");
    await touchGuest(me.userId);
    return NextResponse.json(await pullChanges(id, since, limit));
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  const parsed = pushSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Lote inválido", { issues: parsed.error.issues });
  try {
    await requireRole(me.userId, id, "EDITOR", "WRITE");
    await touchGuest(me.userId);
    return NextResponse.json(await applyChanges(id, me.userId, parsed.data));
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    if (e instanceof UnknownZoneError) return apiError("VALIDATION_ERROR", 400, e.message, { zone: e.zone });
    return internalError(e);
  }
}
