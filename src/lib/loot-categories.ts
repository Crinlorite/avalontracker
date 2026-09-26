// Qué puede salir de un cofre de Avalon, resuelto desde lootchests.json y
// loot.json del dump. Solo categorías ordenadas: los pesos del juego no
// están documentados y no se enseñan (spec §7).
export type LootCategory = "gear" | "artefacts" | "fragments" | "fame_books" | "treasures" | "tokens" | "silver";
export const LOOT_CATEGORIES: LootCategory[] = ["gear", "artefacts", "fragments", "fame_books", "treasures", "tokens", "silver"];
type Ref = { "@name": string; "@chance"?: string };
export type LootList = { Item?: { "@type": string; "@chance": string } | { "@type": string; "@chance": string }[]; LootListReference?: Ref | Ref[] };
type LootByTier = { "@tier": string; LootListReference?: { "@name": string } | { "@name": string }[] };
type RareState = { "@state": string; "@weight"?: string; Loot: { LootByTier: LootByTier | LootByTier[] } };
export type LootChestDef = { "@uniquename": string; RareStates: { RareState: RareState | RareState[] } };

const arr = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export function categorizeLootRef(ref: string): LootCategory | null {
  if (/^T\d_DIRECTLOOTDROP_/.test(ref)) return "gear";
  if (ref === "LOOT_AVALON_ARTEFACTS") return "artefacts";
  if (ref === "LOOT_AVALON_FRAGMENTS" || ref.startsWith("FRAGMENT_LOOT")) return "fragments";
  if (ref.startsWith("FAME_BOOKS")) return "fame_books";
  if (ref.startsWith("TREASURES_")) return "treasures";
  if (/_LOOT_(EXPEDITION|RD)_TOKEN$/.test(ref)) return "tokens";
  if (ref.includes("SILVERBAG")) return "silver";
  return null;
}

// Peso de cada categoría = Σ (peso del estado × chance de la referencia),
// sobre todas las definiciones del cofre (BASE, CHAMPION, BOSS) y sus estados.
// Un estado sin @weight (definiciones de un solo estado) pesa 1.
export function resolveChestCategories(chestDefs: LootChestDef[], lists: Map<string, LootList>, tier: number) {
  const weight = new Map<LootCategory, number>();
  const tiers = new Map<LootCategory, Set<number>>();
  const add = (cat: LootCategory, w: number, t: number | null) => {
    weight.set(cat, (weight.get(cat) ?? 0) + w);
    if (!tiers.has(cat)) tiers.set(cat, new Set());
    if (t !== null) tiers.get(cat)!.add(t);
  };
  for (const def of chestDefs) {
    for (const state of arr(def.RareStates?.RareState)) {
      const sw = state["@weight"] === undefined ? 1 : Number(state["@weight"]) || 0;
      if (sw <= 0) continue;
      for (const byTier of arr(state.Loot?.LootByTier)) {
        if (Number(byTier["@tier"]) !== tier) continue;
        for (const ref of arr(byTier.LootListReference)) {
          const list = lists.get(ref["@name"]);
          if (!list) continue;
          for (const it of arr(list.Item)) {
            const cat = categorizeLootRef(it["@type"]);
            if (cat) add(cat, sw * (Number(it["@chance"]) || 0), null);
          }
          for (const sub of arr(list.LootListReference)) {
            const cat = categorizeLootRef(sub["@name"]);
            if (!cat) continue;
            const t = /^T(\d)_/.exec(sub["@name"]);
            add(cat, sw * (Number(sub["@chance"]) || 0), cat === "gear" && t ? Number(t[1]) : null);
          }
        }
      }
    }
  }
  return [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category]) => ({ category, tiers: [...(tiers.get(category) ?? [])].sort((a, b) => a - b) }));
}
