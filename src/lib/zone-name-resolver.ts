import { prisma } from "@/lib/prisma";

// Resuelve un nombre de zona posiblemente OCR-ruidoso contra la tabla Zone.
// Usado por portal-snapshot cuando la extensión no tiene packet sniffer y
// sólo tiene el nombre OCR'eado del título del minimapa.
//
// Estrategia (de más a menos estricta):
//   1. Exact match case-insensitive.
//   2. startsWith — el OCR puede cortar el final ("Teros-Auius" → "Teros-Auiusum").
//   3. contains — fragmento central suficiente.
//   4. Si el input tiene mucho ruido (caracteres raros), removemos todo lo
//      que no sea [a-zA-Z-] y reintentamos con startsWith.
// Si varios candidatos matchean, devolvemos el más corto (menos ruido).
// Si ninguno, null — el endpoint decide qué hacer.
export async function resolveZoneByFuzzyName(input: string): Promise<{ id: number; name: string } | null> {
  const raw = input.trim();
  if (raw.length < 3) return null;

  // 1. Exact.
  const exact = await prisma.zone.findFirst({
    where: { name: { equals: raw, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (exact) return exact;

  // 2. startsWith.
  const prefix = await prisma.zone.findMany({
    where: { name: { startsWith: raw, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 5,
  });
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) return pickShortest(prefix);

  // 3. contains.
  const contains = await prisma.zone.findMany({
    where: { name: { contains: raw, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 5,
  });
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) return pickShortest(contains);

  // 4. Strip de caracteres raros + startsWith sobre el esqueleto alfabético.
  const stripped = raw.replace(/[^a-zA-Z-]/g, "");
  if (stripped.length >= 3 && stripped !== raw) {
    const fallback = await prisma.zone.findMany({
      where: { name: { startsWith: stripped, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 5,
    });
    if (fallback.length >= 1) return pickShortest(fallback);
  }

  return null;
}

function pickShortest<T extends { name: string }>(candidates: T[]): T {
  return candidates.reduce((best, c) => (c.name.length < best.name.length ? c : best));
}
