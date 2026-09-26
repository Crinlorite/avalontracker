// Sugerencias para el buscador de zonas: a partir de 3 letras (guiones,
// espacios y mayúsculas no cuentan), primero las que empiezan por el
// texto y luego las que lo contienen, en orden alfabético.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function suggestZones(query: string, names: readonly string[], max = 8): string[] {
  const q = norm(query);
  if (q.length < 3) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const n = norm(name);
    if (n.startsWith(q)) starts.push(name);
    else if (n.includes(q)) contains.push(name);
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, max);
}
