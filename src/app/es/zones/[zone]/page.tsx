import { ZonePage, zoneMetadata } from "@/components/zones/pages";

type Props = { params: Promise<{ zone: string }> };

export function generateMetadata({ params }: Props) {
  return zoneMetadata(params, "es");
}

export default function Page({ params }: Props) {
  return <ZonePage params={params} lang="es" />;
}
