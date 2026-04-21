import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ zoneId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { zoneId } = await params;
  const id = Number(zoneId);
  if (!Number.isInteger(id)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const zone = await prisma.zone.findUnique({ where: { id } });
  if (!zone) return apiError("NOT_FOUND", 404, "Zona no encontrada");
  return NextResponse.json(zone);
}
