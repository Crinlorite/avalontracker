import { publicApiGuard, publicJson, publicNotFound, publicOptions } from "@/lib/public-api";
import { zoneBySlug } from "@/lib/avalon-zones";
import { zoneDetailPayload } from "@/lib/zone-public";

// Ficha pública de una zona: nombre o slug (spec §7).
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const blocked = publicApiGuard(req);
  if (blocked) return blocked;
  const z = zoneBySlug((await params).name);
  if (!z) return publicNotFound("Zona desconocida");
  return publicJson(zoneDetailPayload(z), { req });
}

export function OPTIONS() {
  return publicOptions();
}
