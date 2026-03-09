import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const routes = await prisma.route.findMany({
    include: {
      clan: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(routes);
}
