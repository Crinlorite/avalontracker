import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyShare, shareLookupLimiter } from "@/lib/map-shares";
import { loadActiveRoutes } from "@/lib/map-routes";
import { consumeToken, peekBlocked } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { SharedMap } from "@/components/share/SharedMap";

type Props = { params: Promise<{ token: string }> };

// Mismo límite por IP que la API para que adivinar tokens no salga gratis.
// El título y la página comparten esta búsqueda: `cache` la memoiza durante
// la petición, así que se consulta (y se cobra un fallo) una sola vez.
const lookupShare = cache(async (token: string) => {
  const ip = clientIp({ headers: await headers() });
  if (peekBlocked(shareLookupLimiter, ip)) return null;
  const share = await verifyShare(token);
  if (!share) { consumeToken(shareLookupLimiter, ip); return null; }
  const clan = await prisma.clan.findUniqueOrThrow({
    where: { id: share.clanId },
    include: { anchorZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true } } },
  });
  return { share, clan };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await lookupShare((await params).token);
  return { title: found ? `${found.clan.name} · shared map` : "Shared map", robots: { index: false, follow: false } };
}

// Enlace de ver: el mapa en solo lectura sin cuenta. Enlace de editar:
// vista previa y botón para unirse (spec §5.3).
export default async function SharedMapPage({ params }: Props) {
  const { token } = await params;
  const found = await lookupShare(token);
  if (!found) notFound();
  const { share, clan } = found;
  const initial = await loadActiveRoutes(share.clanId);
  return <SharedMap token={token} role={share.role} map={{ id: clan.id, name: clan.name, anchorZone: clan.anchorZone }} initial={initial} />;
}
