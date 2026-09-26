import { ZonesIndexPage, zonesIndexMetadata } from "@/components/zones/pages";

export const metadata = zonesIndexMetadata("en");

export default function Page() {
  return <ZonesIndexPage lang="en" />;
}
