import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { displayName } = body;

  if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json(
      { error: "displayName es requerido" },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { displayName: displayName.trim() },
  });

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
  });
}
