import { publicApiGuard, publicJson } from "@/lib/public-api";
import { zoneIndexPayload, zoneIndexEtag } from "@/lib/zone-public";

// Índice público de las 400 zonas (spec §7). Sin cuenta; caché 1 h; ETag.
export async function GET(req: Request) {
  const blocked = publicApiGuard(req);
  if (blocked) return blocked;
  return publicJson(zoneIndexPayload(), { etag: zoneIndexEtag(), req });
}
