import { ExitsPage, exitsMetadata } from "@/components/zones/pages";

export const metadata = exitsMetadata("en");

// ?from=<zona de Avalon> preselecciona la zona de origen para «dónde vender».
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <ExitsPage lang="en" from={(await searchParams).from} />;
}
