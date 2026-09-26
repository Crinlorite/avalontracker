import { ExitsPage, exitsMetadata } from "@/components/zones/pages";

export const metadata = exitsMetadata("es");

// ?from=<zona de Avalon> preselecciona la zona de origen para «dónde vender».
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <ExitsPage lang="es" from={(await searchParams).from} />;
}
