import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StartMap } from "@/components/map/StartMap";

export const metadata: Metadata = {
  title: "Free Roads of Avalon map",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ from?: string; new?: string }> };

// /map: puerta del mapa personal. Con sesión y un mapa ya hecho, lo abre
// (salvo ?new=1). Si no, ofrece crearlo (como invitado si hace falta).
export default async function MapPage({ searchParams }: Props) {
  const { from, new: wantNew } = await searchParams;
  const session = await auth();
  const fromZone = typeof from === "string" && /^[A-Za-z' -]{2,60}$/.test(from) ? from : undefined;

  if (session?.user?.id && !wantNew && !fromZone) {
    const existing = await prisma.clan.findFirst({
      where: { createdById: session.user.id, kind: "PERSONAL" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (existing) redirect(`/clan/${existing.id}`);
  }
  return <StartMap signedIn={!!session?.user?.id} fromZone={fromZone} />;
}
