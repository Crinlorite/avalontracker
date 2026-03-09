import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInviteCode } from "@/lib/invite-codes";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const activeCode = await prisma.inviteCode.findFirst({
    where: {
      userId: session.user.id,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(activeCode);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const code = await createInviteCode(session.user.id);
    return NextResponse.json(code, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear código";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
