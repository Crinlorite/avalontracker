import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyShare, shareLookupLimiter } from "@/lib/map-shares";
import { loadActiveRoutes } from "@/lib/map-routes";
import { consumeToken } from "@/lib/rate-limit";
import { SharedMap } from "@/components/share/SharedMap";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const share = await verifyShare((await params).token);
  const clan = share ? await prisma.clan.findUnique({ where: { id: share.clanId }, select: { name: true } }) : null;
  return { title: clan ? `${clan.name} · shared map` : "Shared map", robots: { index: false, follow: false } };
}

// Enlace de ver: el mapa en solo lectura sin cuenta. Enlace de editar:
// vista previa y botón para unirse (spec §5.3). Mismo límite por IP que
// la API para que adivinar tokens no salga gratis.
export default async function SharedMapPage({ params }: Props) {
  const { token } = await params;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!consumeToken(shareLookupLimiter, ip).ok) notFound();
  const share = await verifyShare(token);
  if (!share) notFound();
  const clan = await prisma.clan.findUniqueOrThrow({
    where: { id: share.clanId },
    include: { anchorZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true } } },
  });
  const initial = await loadActiveRoutes(share.clanId);
  return <SharedMap token={token} role={share.role} map={{ id: clan.id, name: clan.name, anchorZone: clan.anchorZone }} initial={initial} />;
}
