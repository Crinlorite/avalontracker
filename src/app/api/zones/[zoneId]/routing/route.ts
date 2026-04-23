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

  const r = await prisma.zoneRouting.findUnique({
    where: { zoneId: id },
    include: { nearestRoyal: true, nearestRest: true, nearestCapital: true },
  });
  if (!r) return NextResponse.json({ nearestRoyal: null, nearestRest: null, nearestCapital: null });
  return NextResponse.json({
    nearestRoyal:   r.nearestRoyal   ? { zone: r.nearestRoyal,   hops: r.hopsToRoyal   } : null,
    nearestRest:    r.nearestRest    ? { zone: r.nearestRest,    hops: r.hopsToRest    } : null,
    nearestCapital: r.nearestCapital ? { zone: r.nearestCapital, hops: r.hopsToCapital } : null,
    computedAt: r.computedAt,
  });
}
