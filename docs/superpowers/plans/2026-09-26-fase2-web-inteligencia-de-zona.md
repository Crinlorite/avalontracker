# Fase 2 (web): inteligencia de zona — bichos, botín, precios AODP, «dónde vender», API pública — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada ficha de zona enseñe, con datos del juego y de AODP, lo que nadie más enlaza: qué bichos hay, qué puede salir de cada cofre, cuánto se vende hoy lo que se recolecta y dónde venderlo al salir; y que todo eso quede disponible por una API pública de solo lectura.

**Architecture:** Los datos estáticos (bichos, categorías de botín) los genera el extractor a partir del dump del juego y viajan en JSON dentro del repo, como las zonas. Los precios son lo único vivo: una tarea horaria en el servidor (`instrumentation.ts`) los pide a AODP para los tres servidores del juego y los guarda en Postgres (`MarketPrice`); la ficha los lee de ahí, nunca de AODP por visita. La API pública `/api/v1/zones` sirve lo mismo que la ficha, con caché y CORS.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7, vitest + PGlite, `fast-xml-parser` (ya en dev), `fetch` nativo con gzip.

**Spec:** `docs/superpowers/specs/2026-09-26-avalon-enlazar-todo-design.md` (§7, §10, §11, §12.2, §13, §14).

## Global Constraints

- Commits como `Crinlorite <xlorit@hotmail.es>`, sin atribución; mensajes en castellano. **Nada se despliega sin OK explícito**; la PR a la lista de AODP (Tarea 6) es una publicación externa: solo con su OK.
- **Sin porcentajes ni valor esperado de cofres** (spec §7): categorías ordenadas por peso; el peso no se muestra.
- **Precios AODP cacheados cada hora en Postgres; cero peticiones a AODP por visita** (spec §7). Si AODP falla, se conserva el último dato con su fecha; **nunca un precio sin fecha ni un cero como si fuera precio**.
- AODP: 180 peticiones/min y 300/5 min; URL ≤ 4.096 caracteres; usar `Accept-Encoding: gzip`; `User-Agent: AvalonTracker/2 (+https://avalontracker.app)`.
- **Tres servidores del juego con mercados distintos**: `west` (Américas), `europe`, `east` (Asia). Se cachean los tres; la interfaz lleva selector (por defecto Europa) recordado en `localStorage`. *(Decisión del plan: la spec no lo contemplaba; sin esto los precios serían falsos para dos tercios de los jugadores.)*
- Datos del dump fijados por commit (`avalon-zones.source.json`); el extractor se ejecuta con `--sha` del commit ya usado (`47e4f5aca4d30b7495afa5a625ce0d5795e32050`) para que la regeneración sea reproducible.
- API pública: solo lectura, `Cache-Control: public, s-maxage=3600`, `Access-Control-Allow-Origin: *`, 60 peticiones/min por IP.
- Textos nuevos en EN y ES (`src/i18n/public.ts` para páginas públicas).
- Tests: 🟡 TDD en caché AODP, categorías de botín y extractor; 🟢 humo de páginas (spec §11).

## Review Focus

1. **AODP caído o a medias** (timeout, 5xx, JSON vacío): la ficha debe seguir enseñando los últimos precios con su fecha y la tarea no debe borrar nada. Test en la Tarea 3 (`refreshPrices` con `fetch` que falla conserva las filas anteriores).
2. **Item sin mercado en una ciudad** (AODP devuelve `sell_price_min: 0` y fecha `0001-01-01`): se muestra «sin datos», jamás «0 plata». Test en la Tarea 3 (`parsePrices` descarta esas filas).
3. **Muchos ids en una petición**: ninguna URL puede superar 4.096 caracteres aunque crezcan los ids. Test en la Tarea 3 (`chunkIds` con 400 ids → todas las URLs < 4.000).
4. **Zona con recursos pero sin nodos con tier** (`nodes: []` en el JSON): la sección de precios usa el tier de la zona y no explota. Test en la Tarea 4 (`priceLinesForZone` con `nodes` vacío).
5. **Bicho desconocido en un dump futuro**: el extractor no aborta; se clasifica como `other` con su nombre crudo y la ficha lo pinta igual. Test en la Tarea 1 (`classifyMob("T9_MOB_NUEVO")`).

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `scripts/dump-cache.ts` | `latestSha`, `cached(sha, file)`, `listTemplates` compartidos por los extractores (sacados de `extract-avalon-zones.ts`) |
| `src/lib/mobs.ts` | `classifyMob(name, count)` y tipos `ZoneMob` |
| `src/lib/loot-categories.ts` | `categorizeLootRef(ref)`, `resolveChestCategories(...)` y tipos |
| `scripts/extract-avalon-zones.ts` (cofres) | guarda el tier real de cada cofre (T4/T6/T8 del punto de aparición) |
| `scripts/extract-chest-loot.ts` | genera `src/data/chest-loot.json` desde `lootchests.json` + `loot.json` |
| `scripts/extract-avalon-zones.ts` | añade `mobs` a cada zona |
| `src/data/chest-loot.json`, `src/data/avalon-zones.json` | datos generados |
| `prisma/schema.prisma` | modelo `MarketPrice` |
| `src/lib/aodp.ts` | ids de recursos, `chunkIds`, `parsePrices`, `fetchServerPrices`, `refreshPrices`, `getPrices` |
| `src/instrumentation.ts` | tarea horaria de precios |
| `src/lib/zone-prices.ts` · `zone-prices-db.ts` | qué líneas de precio enseña una ficha (puro) · lectura de la caché (servidor) |
| `src/lib/public-api.ts` · `zone-public.ts` | CORS, caché, ETag, límite por IP · forma JSON de las zonas |
| `scripts/refresh-prices.ts` | refresco manual de precios (self-host, humo) |
| `src/app/api/v1/zones/route.ts`, `…/[name]/route.ts`, `…/[name]/prices/route.ts` | API pública |
| `src/components/zones/ZoneMobs.tsx`, `ZoneChestLoot.tsx`, `ZonePrices.tsx` | secciones nuevas de la ficha |
| `src/components/zones/pages.tsx`, `ExitFinder.tsx`, `src/app/{,es/}exits/page.tsx`, `src/i18n/public.ts` | integración, `?from=` y textos |
| `tests/lib/*.test.ts`, `tests/db/prices.test.ts`, `tests/db/zones-api.test.ts` | tests |

Convención de tests de BD: como en la fase 1 (`startTestDb()` en `beforeAll`, imports dinámicos, handlers invocados directamente).

---

### Task 1: Bichos por zona (`classifyMob` + extractor)

**Files:**
- Create: `src/lib/mobs.ts`, `scripts/dump-cache.ts`
- Modify: `scripts/extract-avalon-zones.ts` (mueve `latestSha`/`cached`/`listTemplates` a `dump-cache.ts`; añade `mobs`)
- Modify: `src/lib/avalon-zones.ts` (tipo `AvalonZone.mobs`)
- Regenerate: `src/data/avalon-zones.json`
- Test: `tests/lib/mobs.test.ts`

**Interfaces:**
- Produces: `type ZoneMob = { kind: "critter"; resource: ResourceType; tier: number; rank: "veteran" | "elite"; count: number } | { kind: "animal"; name: "bear" | "boar" | "direwolf" | "wolpertinger" | "direboar" | "direbear"; tier: number | null; count: number } | { kind: "miniguardian" | "guardian"; name: "basilisk" | "dryad" | "ent" | "oregiant" | "rockgiant"; tier: number; count: number } | { kind: "other"; name: string; count: number }` · `classifyMob(name: string, count: number): ZoneMob` · `classifyMobs(raw: { "@name": string; "@count": string }[]): ZoneMob[]` (agrupa por clave y suma `count`).
- `AvalonZone.mobs: ZoneMob[]` en `src/lib/avalon-zones.ts`.
- `scripts/dump-cache.ts`: `export const REPO = "ao-data/ao-bin-dumps"; export async function latestSha(): Promise<string>; export async function cached(sha: string, file: string): Promise<string>; export async function listTemplates(sha: string): Promise<Map<string, string[]>>`.

Nombres reales del dump (71 tipos en las 400 zonas): `T{4-8}_MOB_CRITTER_{FIBER|ORE|ROCK|WOOD}_ROADS_{VETERAN|ELITE}`, `T{4-8}_MOB_CRITTER_HIDE_MISTCOUGAR_{VETERAN|ELITE}`, `MOB_BEAR`, `MOB_BOAR`, `MOB_DIREWOLF`, `T1_MOB_HIDE_MISTS_WOLPERTINGER`, `T7_MOB_HIDE_FOREST_DIREBOAR_SMALL`, `T8_MOB_HIDE_FOREST_DIREBEAR_SMALL`, `T{6|8}_MOB_MINIGUARDIAN_ROADS_{BASILISK|DRYAD|ENT|OREGIANT|ROCKGIANT}`, `T{6|8}_MOB_GUARDIAN_FOREST_{…}`.

- [ ] **Step 1: Test que falla**

```ts
// tests/lib/mobs.test.ts
import { describe, it, expect } from "vitest";
import { classifyMob, classifyMobs } from "@/lib/mobs";

describe("classifyMob", () => {
  it("critters de recolección: recurso, tier y rango", () => {
    expect(classifyMob("T5_MOB_CRITTER_ORE_ROADS_VETERAN", 3)).toEqual({ kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 3 });
    expect(classifyMob("T7_MOB_CRITTER_ROCK_ROADS_ELITE", 1)).toEqual({ kind: "critter", resource: "STONE", tier: 7, rank: "elite", count: 1 });
    expect(classifyMob("T6_MOB_CRITTER_HIDE_MISTCOUGAR_VETERAN", 2)).toEqual({ kind: "critter", resource: "HIDE", tier: 6, rank: "veteran", count: 2 });
  });
  it("animales, con o sin tier", () => {
    expect(classifyMob("MOB_BEAR", 4)).toEqual({ kind: "animal", name: "bear", tier: null, count: 4 });
    expect(classifyMob("MOB_DIREWOLF", 1)).toEqual({ kind: "animal", name: "direwolf", tier: null, count: 1 });
    expect(classifyMob("T7_MOB_HIDE_FOREST_DIREBOAR_SMALL", 2)).toEqual({ kind: "animal", name: "direboar", tier: 7, count: 2 });
    expect(classifyMob("T1_MOB_HIDE_MISTS_WOLPERTINGER", 1)).toEqual({ kind: "animal", name: "wolpertinger", tier: 1, count: 1 });
  });
  it("guardianes y miniguardianes", () => {
    expect(classifyMob("T6_MOB_MINIGUARDIAN_ROADS_ENT", 1)).toEqual({ kind: "miniguardian", name: "ent", tier: 6, count: 1 });
    expect(classifyMob("T8_MOB_GUARDIAN_FOREST_ROCKGIANT", 1)).toEqual({ kind: "guardian", name: "rockgiant", tier: 8, count: 1 });
  });
  it("lo desconocido no rompe: queda como other con su nombre", () => {
    expect(classifyMob("T9_MOB_NUEVO_RARO", 2)).toEqual({ kind: "other", name: "T9_MOB_NUEVO_RARO", count: 2 });
  });
  it("classifyMobs agrupa y suma", () => {
    const out = classifyMobs([{ "@name": "MOB_BEAR", "@count": "2" }, { "@name": "MOB_BEAR", "@count": "3" }, { "@name": "T4_MOB_CRITTER_WOOD_ROADS_VETERAN", "@count": "1" }]);
    expect(out).toEqual([{ kind: "animal", name: "bear", tier: null, count: 5 }, { kind: "critter", resource: "WOOD", tier: 4, rank: "veteran", count: 1 }]);
  });
});
```

Run: `npx vitest run tests/lib/mobs.test.ts` — Expected: FAIL (`@/lib/mobs` no existe).

- [ ] **Step 2: Implementación**

```ts
// src/lib/mobs.ts
// Bichos de una zona de Avalon, a partir de `mobcounts` de world.json.
import type { ResourceType } from "@/lib/avalon-zones";

export type ZoneMob =
  | { kind: "critter"; resource: ResourceType; tier: number; rank: "veteran" | "elite"; count: number }
  | { kind: "animal"; name: "bear" | "boar" | "direwolf" | "wolpertinger" | "direboar" | "direbear"; tier: number | null; count: number }
  | { kind: "miniguardian" | "guardian"; name: "basilisk" | "dryad" | "ent" | "oregiant" | "rockgiant"; tier: number; count: number }
  | { kind: "other"; name: string; count: number };

const RES: Record<string, ResourceType> = { ORE: "ORE", WOOD: "WOOD", FIBER: "FIBER", HIDE: "HIDE", ROCK: "STONE" };
const ANIMALS: Record<string, Extract<ZoneMob, { kind: "animal" }>["name"]> = {
  BEAR: "bear", BOAR: "boar", DIREWOLF: "direwolf", WOLPERTINGER: "wolpertinger", DIREBOAR: "direboar", DIREBEAR: "direbear",
};
const GUARDIANS = new Set(["BASILISK", "DRYAD", "ENT", "OREGIANT", "ROCKGIANT"]);

export function classifyMob(name: string, count: number): ZoneMob {
  let m = /^T(\d)_MOB_CRITTER_(ORE|WOOD|FIBER|ROCK|HIDE)_(?:ROADS|MISTCOUGAR)_(VETERAN|ELITE)$/.exec(name);
  if (m) return { kind: "critter", resource: RES[m[2]], tier: Number(m[1]), rank: m[3] === "ELITE" ? "elite" : "veteran", count };
  m = /^T(\d)_MOB_(?:MINIGUARDIAN_ROADS|GUARDIAN_FOREST)_([A-Z]+)$/.exec(name);
  if (m && GUARDIANS.has(m[2])) {
    return { kind: name.includes("MINIGUARDIAN") ? "miniguardian" : "guardian", name: m[2].toLowerCase() as "basilisk" | "dryad" | "ent" | "oregiant" | "rockgiant", tier: Number(m[1]), count };
  }
  m = /^(?:T(\d)_)?MOB_(?:HIDE_(?:MISTS|FOREST)_)?([A-Z]+?)(?:_SMALL)?$/.exec(name);
  if (m && ANIMALS[m[2]]) return { kind: "animal", name: ANIMALS[m[2]], tier: m[1] ? Number(m[1]) : null, count };
  return { kind: "other", name, count };
}

export function classifyMobs(raw: { "@name": string; "@count": string }[]): ZoneMob[] {
  const acc = new Map<string, ZoneMob>();
  for (const r of raw) {
    const mob = classifyMob(r["@name"], Number(r["@count"]) || 0);
    const key = JSON.stringify({ ...mob, count: 0 });
    const prev = acc.get(key);
    if (prev) prev.count += mob.count; else acc.set(key, mob);
  }
  return [...acc.values()];
}
```

Run: `npx vitest run tests/lib/mobs.test.ts` — Expected: 5 tests PASS.

- [ ] **Step 3: Sacar la caché del dump a `scripts/dump-cache.ts`**

Mueve a `scripts/dump-cache.ts` (exportados) `REPO`, `latestSha`, `cached` y `listTemplates` tal y como están en `scripts/extract-avalon-zones.ts` (líneas 35 y 89-123), junto con la constante `ROOT` que usa `cached` (o defínela allí como `path.resolve(__dirname, "..")`); `pool` se queda en el extractor. En `extract-avalon-zones.ts` importa `import { REPO, latestSha, cached, listTemplates } from "./dump-cache";` y borra las copias. Ejecuta `npx tsx scripts/extract-avalon-zones.ts --sha 47e4f5aca4d30b7495afa5a625ce0d5795e32050` y comprueba que `src/data/avalon-zones.json` **no cambia** (`git diff --stat src/data` vacío): el refactor no toca la salida.

- [ ] **Step 4: `mobs` en el extractor y en el tipo**

En `scripts/extract-avalon-zones.ts`: `import { classifyMobs } from "../src/lib/mobs";` (import relativo: los scripts no usan el alias `@/`). Añade `mobs: ZoneMob[]` a `AvalonZoneOut` (importa el tipo) y, al construir cada zona:

```ts
    const rawMobs = ((c["mobcounts"] as { mob?: unknown } | null)?.mob ?? []) as { "@name": string; "@count": string }[];
    const mobs = classifyMobs(Array.isArray(rawMobs) ? rawMobs : [rawMobs]);
```

y `mobs,` en el objeto devuelto (tras `nodes`). En `src/lib/avalon-zones.ts` añade `mobs: ZoneMob[];` a `AvalonZone` (importa `type { ZoneMob } from "@/lib/mobs"`; ojo al import circular: `mobs.ts` importa solo el tipo `ResourceType` de `avalon-zones.ts`, con `import type`, lo que no crea ciclo en runtime).

Regenera: `npx tsx scripts/extract-avalon-zones.ts --sha 47e4f5aca4d30b7495afa5a625ce0d5795e32050`. Comprueba: `python3 -c "import json;z=json.load(open('src/data/avalon-zones.json'));print(len(z), sum(len(x['mobs']) for x in z), sum(1 for x in z for m in x['mobs'] if m['kind']=='other'))"` — Expected: `400 <N> 0` (ningún `other` con el dump actual).

- [ ] **Step 5: Verificar y commit**

Run: `npx vitest run tests/lib/mobs.test.ts tests/db/personal-maps.test.ts && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add src/lib/mobs.ts scripts/dump-cache.ts scripts/extract-avalon-zones.ts src/lib/avalon-zones.ts src/data/avalon-zones.json tests/lib/mobs.test.ts
git commit -m "datos: bichos por zona de Avalon (critters, animales, guardianes) desde mobcounts del dump"
```

### Task 2: Tier real de cada cofre y categorías de botín (`chest-loot.json`)

**Files:**
- Create: `src/lib/loot-categories.ts`, `scripts/extract-chest-loot.ts`, `src/data/chest-loot.json`
- Modify: `scripts/extract-avalon-zones.ts` (`chestOf` devuelve el tier; `tally` agrupa también por tier), `src/lib/avalon-zones.ts` (`chests[].tier`, helper `chestLootCategories`), `src/components/zones/pages.tsx` (clave de la lista de cofres y tier visible)
- Regenerate: `src/data/avalon-zones.json`
- Test: `tests/lib/loot-categories.test.ts`

**Interfaces:**
- Produces: `type LootCategory = "gear" | "artefacts" | "fragments" | "fame_books" | "treasures" | "tokens" | "silver"` · `categorizeLootRef(refName: string): LootCategory | null` · `resolveChestCategories(chestDefs: LootChestDef[], lootLists: Map<string, LootList>, tier: number): { category: LootCategory; tiers: number[] }[]` (ordenadas por peso acumulado, sin exponer el peso) · fichero `src/data/chest-loot.json`: `{ "GREEN:small:6": [{ "category": "gear", "tiers": [6,7] }, …], … }` con claves `${ChestType}:${Size}:${tier}` · `AvalonZone.chests: { type: ChestType; size: Size; tier: number; count: number }[]` · `chestLootCategories(type: ChestType, size: Size, tier: number): { category: LootCategory; tiers: number[] }[]` en `src/lib/avalon-zones.ts`.

**Hecho verificado en el dump 47e4f5a (26-sep):** el **tier del cofre va en el nombre del punto de aparición**, no en el tier de la zona: `SpawnPoint_LOOTCHEST_{SMALL|MEDIUM}_AVALON_ROAD_[VETERAN_|ELITE_]T{4|6|8}`. Combinaciones que existen en las plantillas: verde pequeño (`SMALL`, sin rango) T4/T6/T8; azul grande (`MEDIUM_VETERAN`) T4/T6/T8; oro pequeño (`SMALL_ELITE`) T6/T8; oro grande (`MEDIUM_ELITE`) T6/T8. Las definiciones de `lootchests.json` casan exactamente: `AVALON_SMALL_SOLO_*` tiene tablas `LootByTier` 4/6/8, `AVALON_MEDIUM_VETERAN_*` 4/6/8, `AVALON_SMALL_ELITE_*` y `AVALON_MEDIUM_ELITE_*` solo 6/8. Cada grupo tiene tres variantes (`_BASE`, `_CHAMPION`, `_BOSS`) con `RareStates.RareState[]` (`@state`, `@weight`) → `Loot.LootByTier[]` (`@tier`) → `LootListReference[]` (`@name`). En `loot.json`, cada `Lootlist` (`@name`) tiene `Item[]` (`@type`, `@chance`) y `LootListReference[]` (`@name`, `@chance`). Referencias de 2.º nivel que aparecen: `T{n}_DIRECTLOOTDROP_WHITE`, `LOOT_AVALON_ARTEFACTS`, `LOOT_AVALON_FRAGMENTS`, `FRAGMENT_LOOT`, `FRAGMENT_LOOT_10X`, `FRAGMENT_LOOT_100X`, `FAME_BOOKS_LOOT_CHESTS`, `TREASURES_ROAD_CHEST_LOOT`, `T{n}_LOOT_EXPEDITION_TOKEN`, `T{n}_LOOT_RD_TOKEN`; ítems directos `T1_SILVERBAG_NONTRADABLE`, `T4_SILVERBAG_NONTRADABLE`. *(Decisión del plan: se unen las tres variantes BASE/CHAMPION/BOSS —qué guarda el cofre depende del bicho que lo custodia, y eso no está en el dump— y se dice en la nota de la ficha.)*

- [ ] **Step 1: Test que falla**

```ts
// tests/lib/loot-categories.test.ts
import { describe, it, expect } from "vitest";
import { categorizeLootRef, resolveChestCategories } from "@/lib/loot-categories";

describe("categorizeLootRef", () => {
  it("mapea las referencias del dump a categorías", () => {
    expect(categorizeLootRef("T6_DIRECTLOOTDROP_WHITE")).toBe("gear");
    expect(categorizeLootRef("LOOT_AVALON_ARTEFACTS")).toBe("artefacts");
    expect(categorizeLootRef("LOOT_AVALON_FRAGMENTS")).toBe("fragments");
    expect(categorizeLootRef("FRAGMENT_LOOT_100X")).toBe("fragments");
    expect(categorizeLootRef("FAME_BOOKS_LOOT_CHESTS")).toBe("fame_books");
    expect(categorizeLootRef("TREASURES_ROAD_CHEST_LOOT")).toBe("treasures");
    expect(categorizeLootRef("T6_LOOT_RD_TOKEN")).toBe("tokens");
    expect(categorizeLootRef("T4_LOOT_EXPEDITION_TOKEN")).toBe("tokens");
    expect(categorizeLootRef("T4_SILVERBAG_NONTRADABLE")).toBe("silver");
    expect(categorizeLootRef("ALGO_QUE_NO_CONOZCO")).toBeNull();
  });
});

describe("resolveChestCategories", () => {
  const lists = new Map([
    ["L6", { Item: [{ "@type": "T1_SILVERBAG_NONTRADABLE", "@chance": "4" }], LootListReference: [{ "@name": "T6_DIRECTLOOTDROP_WHITE", "@chance": "3" }, { "@name": "T7_DIRECTLOOTDROP_WHITE", "@chance": "0.5" }, { "@name": "LOOT_AVALON_ARTEFACTS", "@chance": "0.01" }] }],
    ["L6C", { Item: [], LootListReference: [{ "@name": "FAME_BOOKS_LOOT_CHESTS", "@chance": "10" }] }],
  ]);
  const chests = [
    { "@uniquename": "X_BASE", RareStates: { RareState: [{ "@state": "standard", "@weight": "6", Loot: { LootByTier: [{ "@tier": "6", LootListReference: [{ "@name": "L6" }] }] } }] } },
    { "@uniquename": "X_CHAMPION", RareStates: { RareState: [{ "@state": "standard", "@weight": "1", Loot: { LootByTier: [{ "@tier": "6", LootListReference: [{ "@name": "L6C" }] }] } }] } },
  ];
  it("ordena por peso acumulado (peso del estado × chance) y agrupa tiers del equipo", () => {
    expect(resolveChestCategories(chests, lists, 6)).toEqual([
      { category: "silver", tiers: [] },        // 6 × 4 = 24
      { category: "gear", tiers: [6, 7] },       // 6 × 3.5 = 21
      { category: "fame_books", tiers: [] },     // 1 × 10 = 10
      { category: "artefacts", tiers: [] },      // 6 × 0.01
    ]);
  });
  it("un estado sin peso (@weight ausente) cuenta como 1, no se descarta", () => {
    const solo = [{ "@uniquename": "Y", RareStates: { RareState: { "@state": "standard", Loot: { LootByTier: { "@tier": "6", LootListReference: { "@name": "L6C" } } } } } }];
    expect(resolveChestCategories(solo, lists, 6)).toEqual([{ category: "fame_books", tiers: [] }]);
  });
  it("un tier sin tabla devuelve vacío en vez de romper", () => {
    expect(resolveChestCategories(chests, lists, 8)).toEqual([]);
  });
});
```

Run: `npx vitest run tests/lib/loot-categories.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementación**

```ts
// src/lib/loot-categories.ts
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
```

Run: `npx vitest run tests/lib/loot-categories.test.ts` — Expected: 4 tests PASS.

- [ ] **Step 3: Tier real del cofre en el extractor y en el tipo**

En `scripts/extract-avalon-zones.ts`:

```ts
function chestOf(name: string): { type: ChestType; size: Size; tier: number } | null {
  const m = /^SpawnPoint_LOOTCHEST_(SMALL|MEDIUM)_AVALON_ROAD_(?:(VETERAN|ELITE)_)?T(\d)$/.exec(name);
  if (!m) return null;
  const type: ChestType = m[2] === "ELITE" ? "GOLD" : m[2] === "VETERAN" ? "BLUE" : "GREEN";
  return { type, size: m[1] === "SMALL" ? "small" : "large", tier: Number(m[3]) };
}
```

`tally` pasa a agrupar por `${type}|${size}|${tier ?? ""}` y a devolver `tier` cuando lo hay (recursos y mazmorras siguen sin tier): cambia `Counted<T>` a `{ type: T; size: Size; tier?: number; count: number }` y la clave/orden (`a.type.localeCompare(b.type) || a.size.localeCompare(b.size) || (a.tier ?? 0) - (b.tier ?? 0)`). En `AvalonZoneOut`, `chests: { type: ChestType; size: Size; tier: number; count: number }[]`; el marcador del minimapa de tipo `chest` lleva también `tier`. En `src/lib/avalon-zones.ts`: `chests: { type: ChestType; size: Size; tier: number; count: number }[]` y en `map.markers` el campo opcional `tier?: number`.

Regenera: `npx tsx scripts/extract-avalon-zones.ts --sha 47e4f5aca4d30b7495afa5a625ce0d5795e32050`. Comprueba: `python3 -c "import json,collections;z=json.load(open('src/data/avalon-zones.json'));c=collections.Counter((x['type'],x['size'],x['tier']) for a in z for x in a['chests']);print(sorted(c))"` — Expected: solo las combinaciones verificadas arriba (GREEN small 4/6/8, BLUE large 4/6/8, GOLD small 6/8, GOLD large 6/8).

En `src/components/zones/pages.tsx`, en la tarjeta de cofres, la clave pasa a `${c.type}-${c.size}-${c.tier}` y la línea enseña el tier: `{c.count}× {t(`chest.${c.type}`)} <span className="text-slate-400">({t(`size.${c.size}`)} · T{c.tier})</span>`.

Run: `npx tsc --noEmit -p .` — Expected: limpio (si `ZoneMiniMap` o `ZoneBrowser` desestructuran cofres por clave, actualiza las claves igual).

- [ ] **Step 4: Generador `scripts/extract-chest-loot.ts`**

```ts
// scripts/extract-chest-loot.ts
// Genera src/data/chest-loot.json: categorías de botín por tipo de cofre,
// tamaño y tier, desde lootchests.json y loot.json del dump.
//   npx tsx scripts/extract-chest-loot.ts --sha <commit>
import fs from "node:fs";
import path from "node:path";
import { latestSha, cached } from "./dump-cache";
import { resolveChestCategories, type LootChestDef, type LootList } from "../src/lib/loot-categories";

const OUT = path.join(process.cwd(), "src/data/chest-loot.json");
// (tipo, tamaño) → grupo de definiciones del juego y tiers con tabla.
const GROUPS: Record<string, { group: string; tiers: number[] }> = {
  "GREEN:small": { group: "AVALON_SMALL_SOLO", tiers: [4, 6, 8] },
  "BLUE:large": { group: "AVALON_MEDIUM_VETERAN", tiers: [4, 6, 8] },
  "GOLD:small": { group: "AVALON_SMALL_ELITE", tiers: [6, 8] },
  "GOLD:large": { group: "AVALON_MEDIUM_ELITE", tiers: [6, 8] },
};
const VARIANTS = ["BASE", "CHAMPION", "BOSS"];

async function main() {
  const i = process.argv.indexOf("--sha");
  const sha = i >= 0 ? process.argv[i + 1] : await latestSha();
  const chests = JSON.parse(await cached(sha, "lootchests.json")).LootChests.LootChest as LootChestDef[];
  const lootTop = JSON.parse(await cached(sha, "loot.json"));
  const lootRoot = lootTop[Object.keys(lootTop).pop()!];
  const raw = Array.isArray(lootRoot.Lootlist) ? lootRoot.Lootlist : [lootRoot.Lootlist];
  const lists = new Map<string, LootList>(raw.map((l: LootList & { "@name": string }) => [l["@name"], l]));
  const byName = new Map(chests.map((c) => [c["@uniquename"], c]));
  const out: Record<string, { category: string; tiers: number[] }[]> = {};
  for (const [key, { group, tiers }] of Object.entries(GROUPS)) {
    const defs = VARIANTS.map((v) => byName.get(`${group}_${v}`)).filter((d): d is LootChestDef => !!d);
    if (defs.length !== VARIANTS.length) throw new Error(`faltan definiciones para ${group}`);
    for (const tier of tiers) {
      const cats = resolveChestCategories(defs, lists, tier);
      if (cats.length === 0) throw new Error(`sin botín para ${group} T${tier}`);
      out[`${key}:${tier}`] = cats;
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`[chest-loot] ${Object.keys(out).length} combinaciones → ${path.relative(process.cwd(), OUT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx scripts/extract-chest-loot.ts --sha 47e4f5aca4d30b7495afa5a625ce0d5795e32050` — Expected: `[chest-loot] 10 combinaciones`. Comprueba a mano que ninguna lista está vacía y que `GOLD:large:8` incluye `artefacts`.

- [ ] **Step 5: Helper en `src/lib/avalon-zones.ts`**

```ts
import chestLoot from "@/data/chest-loot.json";
import type { LootCategory } from "@/lib/loot-categories";

// Categorías de botín del cofre (tipo, tamaño, tier real del punto de
// aparición). Combinación sin tabla → [] y la ficha no inventa nada.
export function chestLootCategories(type: ChestType, size: Size, tier: number): { category: LootCategory; tiers: number[] }[] {
  const table = chestLoot as Record<string, { category: LootCategory; tiers: number[] }[]>;
  return table[`${type}:${size}:${tier}`] ?? [];
}
```

- [ ] **Step 6: Verificar y commit**

Run: `npx vitest run tests/lib && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add src/lib/loot-categories.ts scripts/extract-chest-loot.ts scripts/extract-avalon-zones.ts src/data/chest-loot.json src/data/avalon-zones.json src/lib/avalon-zones.ts src/components/zones/pages.tsx tests/lib/loot-categories.test.ts
git commit -m "datos: tier real de cada cofre (T4/T6/T8 del punto de aparición) y categorías de botín desde lootchests.json y loot.json (sin porcentajes)"
```

### Task 3: Caché horaria de precios AODP (`MarketPrice`)

**Files:**
- Create: `src/lib/aodp.ts` (puro: ids, lotes, parseo), `src/lib/market-prices.ts` (BD: refresco y lectura), `scripts/refresh-prices.ts` (refresco manual)
- Modify: `prisma/schema.prisma` (modelo `MarketPrice`), `src/instrumentation.ts` (tarea horaria), `.env.example` (`AODP_DISABLED`)
- Test: `tests/lib/aodp.test.ts`, `tests/db/prices.test.ts`

**Interfaces:**
- Produces (`src/lib/aodp.ts`): `type GameServer = "west" | "europe" | "east"` · `GAME_SERVERS: GameServer[]` · `MARKET_CITIES = ["Lymhurst","Martlock","Thetford","Bridgewatch","Fort Sterling","Caerleon","Brecilien"]` · `resourceItemId(resource: ResourceType, tier: number, enchant: 0|1|2|3): string` (`T6_FIBER`, `T6_HIDE_LEVEL2@2`; STONE → `ROCK`) · `RESOURCE_ITEM_IDS: string[]` (100 ids: 5 recursos × T4–T8 × .0–.3) · `chunkIds(ids: string[], maxUrl = 3800): string[][]` · `aodpUrl(server, ids, cities?): string` · `type ParsedPrice = { itemId: string; city: string; sellMin: number | null; sellMinAt: Date | null; buyMax: number | null; buyMaxAt: Date | null }` · `parsePrices(json: unknown): ParsedPrice[]` (descarta filas sin ningún dato).
- Produces (`src/lib/market-prices.ts`): `refreshPrices(opts?: { fetchImpl?: typeof fetch; servers?: GameServer[]; now?: Date }): Promise<{ server: GameServer; rows: number; error?: string }[]>` · `type PriceCell = { sellMin: number | null; sellMinAt: string | null; buyMax: number | null; buyMaxAt: string | null }` · `getPrices(server: GameServer, itemIds: string[]): Promise<{ fetchedAt: string | null; prices: Record<string, Record<string, PriceCell>> }>` (`prices[itemId][city]`).
- Modelo Prisma: `MarketPrice { server, itemId, city, sellMin Int?, sellMinAt DateTime?, buyMax Int?, buyMaxAt DateTime?, fetchedAt DateTime; @@id([server, itemId, city]) }`.

Respuesta real de AODP (verificada el 26-sep contra `europe`): array de `{ item_id, city, quality, sell_price_min, sell_price_min_date, sell_price_max, …, buy_price_max, buy_price_max_date, … }`; las fechas van sin zona horaria y son UTC (`2026-09-26T10:15:00`); sin dato = precio `0` y fecha `0001-01-01T00:00:00`. `sell_price_min` = oferta de venta más barata (a lo que tendrías que poner el tuyo); `buy_price_max` = mejor orden de compra (venta instantánea). *(Decisión del plan: se guarda también `buyMax`, porque «vender ya» y «poner a la venta» son dos precios distintos y el jugador de Avalon suele vender ya; y se incluye Brecilien, que es la ciudad a la que se sale por las Nieblas.)*

- [ ] **Step 1: Test puro que falla**

```ts
// tests/lib/aodp.test.ts
import { describe, it, expect } from "vitest";
import { resourceItemId, RESOURCE_ITEM_IDS, chunkIds, aodpUrl, parsePrices, MARKET_CITIES } from "@/lib/aodp";

describe("ids de recursos", () => {
  it("construye los ids de AODP con encantamiento y piedra → ROCK", () => {
    expect(resourceItemId("FIBER", 6, 0)).toBe("T6_FIBER");
    expect(resourceItemId("HIDE", 6, 2)).toBe("T6_HIDE_LEVEL2@2");
    expect(resourceItemId("STONE", 4, 0)).toBe("T4_ROCK");
    expect(resourceItemId("ORE", 8, 3)).toBe("T8_ORE_LEVEL3@3");
  });
  it("100 ids: 5 recursos × T4–T8 × .0–.3, sin repetidos", () => {
    expect(RESOURCE_ITEM_IDS).toHaveLength(100);
    expect(new Set(RESOURCE_ITEM_IDS).size).toBe(100);
    expect(RESOURCE_ITEM_IDS).toContain("T4_ORE");
    expect(RESOURCE_ITEM_IDS).toContain("T8_ROCK_LEVEL3@3");
  });
});

describe("lotes y URL", () => {
  it("ninguna URL supera los 4096 caracteres aunque haya 400 ids", () => {
    const many = Array.from({ length: 400 }, (_, i) => `T8_ITEM_LEVEL3@3_${i}`);
    const chunks = chunkIds(many);
    expect(chunks.flat()).toEqual(many);
    for (const c of chunks) expect(aodpUrl("europe", c).length).toBeLessThan(4096);
  });
  it("URL con servidor, ids, ciudades y calidad 1", () => {
    const u = aodpUrl("west", ["T4_ORE", "T4_ORE_LEVEL1@1"]);
    expect(u).toBe(`https://west.albion-online-data.com/api/v2/stats/prices/T4_ORE,T4_ORE_LEVEL1@1?locations=${MARKET_CITIES.map(encodeURIComponent).join(",")}&qualities=1`);
  });
});

describe("parsePrices", () => {
  it("0001-01-01 y precio 0 = sin dato; fechas UTC; filas sin nada se descartan", () => {
    const rows = parsePrices([
      { item_id: "T4_ORE", city: "Lymhurst", quality: 1, sell_price_min: 100, sell_price_min_date: "2026-09-26T12:00:00", buy_price_max: 84, buy_price_max_date: "2026-09-26T11:15:00" },
      { item_id: "T4_ORE", city: "Caerleon", quality: 1, sell_price_min: 0, sell_price_min_date: "0001-01-01T00:00:00", buy_price_max: 0, buy_price_max_date: "0001-01-01T00:00:00" },
      { item_id: "T4_ORE", city: "Martlock", quality: 1, sell_price_min: 0, sell_price_min_date: "0001-01-01T00:00:00", buy_price_max: 70, buy_price_max_date: "2026-09-26T10:00:00" },
    ]);
    expect(rows).toEqual([
      { itemId: "T4_ORE", city: "Lymhurst", sellMin: 100, sellMinAt: new Date("2026-09-26T12:00:00Z"), buyMax: 84, buyMaxAt: new Date("2026-09-26T11:15:00Z") },
      { itemId: "T4_ORE", city: "Martlock", sellMin: null, sellMinAt: null, buyMax: 70, buyMaxAt: new Date("2026-09-26T10:00:00Z") },
    ]);
  });
  it("basura → lista vacía, nunca excepción", () => {
    expect(parsePrices(null)).toEqual([]);
    expect(parsePrices({ error: "x" })).toEqual([]);
    expect(parsePrices([{ item_id: 5 }])).toEqual([]);
  });
});
```

Run: `npx vitest run tests/lib/aodp.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: `src/lib/aodp.ts`**

```ts
// src/lib/aodp.ts
// Albion Online Data Project (AODP): ids, URLs y parseo. Sin red ni BD
// (eso vive en market-prices.ts). Límites de AODP: 180 peticiones/min,
// 300/5 min, URL ≤ 4096 caracteres.
import type { ResourceType } from "@/lib/avalon-zones";

export type GameServer = "west" | "europe" | "east";
export const GAME_SERVERS: GameServer[] = ["west", "europe", "east"];
export const DEFAULT_SERVER: GameServer = "europe";
export const MARKET_CITIES = ["Lymhurst", "Martlock", "Thetford", "Bridgewatch", "Fort Sterling", "Caerleon", "Brecilien"] as const;
export type MarketCity = (typeof MARKET_CITIES)[number];
export const USER_AGENT = "AvalonTracker/2 (+https://avalontracker.app)";

const ITEM_RES: Record<ResourceType, string> = { ORE: "ORE", WOOD: "WOOD", FIBER: "FIBER", HIDE: "HIDE", STONE: "ROCK" };

export function resourceItemId(resource: ResourceType, tier: number, enchant: 0 | 1 | 2 | 3): string {
  const base = `T${tier}_${ITEM_RES[resource]}`;
  return enchant ? `${base}_LEVEL${enchant}@${enchant}` : base;
}

export const RESOURCE_ITEM_IDS: string[] = (["ORE", "WOOD", "FIBER", "HIDE", "STONE"] as ResourceType[]).flatMap((r) =>
  [4, 5, 6, 7, 8].flatMap((t) => ([0, 1, 2, 3] as const).map((e) => resourceItemId(r, t, e))),
);

export function aodpUrl(server: GameServer, ids: string[], cities: readonly string[] = MARKET_CITIES): string {
  return `https://${server}.albion-online-data.com/api/v2/stats/prices/${ids.join(",")}?locations=${cities.map(encodeURIComponent).join(",")}&qualities=1`;
}

// Lotes de ids cuya URL (con las ciudades) se queda por debajo de maxUrl.
export function chunkIds(ids: string[], maxUrl = 3800): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const id of ids) {
    if (cur.length && aodpUrl("europe", [...cur, id]).length > maxUrl) { out.push(cur); cur = []; }
    cur.push(id);
  }
  if (cur.length) out.push(cur);
  return out;
}

export type ParsedPrice = { itemId: string; city: string; sellMin: number | null; sellMinAt: Date | null; buyMax: number | null; buyMaxAt: Date | null };

// AODP marca «sin dato» con precio 0 y fecha 0001-01-01. Las fechas vienen
// sin zona y son UTC.
function priceAt(price: unknown, date: unknown): [number | null, Date | null] {
  if (typeof price !== "number" || price <= 0 || typeof date !== "string" || date.startsWith("0001-")) return [null, null];
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(date) ? date : `${date}Z`);
  return Number.isNaN(d.getTime()) ? [null, null] : [Math.round(price), d];
}

export function parsePrices(json: unknown): ParsedPrice[] {
  if (!Array.isArray(json)) return [];
  const out: ParsedPrice[] = [];
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.item_id !== "string" || typeof o.city !== "string") continue;
    const [sellMin, sellMinAt] = priceAt(o.sell_price_min, o.sell_price_min_date);
    const [buyMax, buyMaxAt] = priceAt(o.buy_price_max, o.buy_price_max_date);
    if (sellMin === null && buyMax === null) continue;
    out.push({ itemId: o.item_id, city: o.city, sellMin, sellMinAt, buyMax, buyMaxAt });
  }
  return out;
}
```

Run: `npx vitest run tests/lib/aodp.test.ts` — Expected: 6 tests PASS.

- [ ] **Step 3: Modelo `MarketPrice` y test de BD que falla**

En `prisma/schema.prisma`, tras `model MapShare { … }`:

```prisma
// Precios de AODP cacheados cada hora (spec §7). Una fila por servidor del
// juego, item y ciudad. Precio sin dato = NULL, nunca 0.
model MarketPrice {
  server    String
  itemId    String
  city      String
  sellMin   Int?
  sellMinAt DateTime?
  buyMax    Int?
  buyMaxAt  DateTime?
  fetchedAt DateTime
  @@id([server, itemId, city])
}
```

Run: `npx prisma generate` — Expected: cliente regenerado sin errores.

```ts
// tests/db/prices.test.ts
// Caché de precios AODP (plan fase 2, Tarea 3): red que falla, fila conservada, sin ceros.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb } from "./setup";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let mp: typeof import("@/lib/market-prices");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  mp = await import("@/lib/market-prices");
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

const row = (item_id: string, city: string, sell: number, date: string, buy = 0, buyDate = "0001-01-01T00:00:00") =>
  ({ item_id, city, quality: 1, sell_price_min: sell, sell_price_min_date: date, buy_price_max: buy, buy_price_max_date: buyDate });
const fetchWith = (handler: (url: string) => unknown) => (async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = handler(url);
  if (body instanceof Error) throw body;
  if (typeof body === "number") return new Response("upstream", { status: body });
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

describe("refreshPrices", () => {
  it("guarda por servidor y ciudad, y convierte 0/0001-01-01 en NULL (nunca un cero)", async () => {
    const now = new Date("2026-09-26T13:00:00Z");
    const r = await mp.refreshPrices({ now, servers: ["europe"], fetchImpl: fetchWith((u) => u.includes("europe.") ? [
      row("T4_ORE", "Lymhurst", 100, "2026-09-26T12:00:00", 84, "2026-09-26T11:00:00"),
      row("T4_ORE", "Caerleon", 0, "0001-01-01T00:00:00"),
      row("T5_ROCK", "Martlock", 0, "0001-01-01T00:00:00", 70, "2026-09-26T10:00:00"),
    ] : []) });
    expect(r).toEqual([{ server: "europe", rows: 2 }]);
    const { fetchedAt, prices } = await mp.getPrices("europe", ["T4_ORE", "T5_ROCK"]);
    expect(fetchedAt).toBe(now.toISOString());
    expect(prices.T4_ORE.Lymhurst).toEqual({ sellMin: 100, sellMinAt: "2026-09-26T12:00:00.000Z", buyMax: 84, buyMaxAt: "2026-09-26T11:00:00.000Z" });
    expect(prices.T4_ORE.Caerleon).toBeUndefined();
    expect(prices.T5_ROCK.Martlock).toEqual({ sellMin: null, sellMinAt: null, buyMax: 70, buyMaxAt: "2026-09-26T10:00:00.000Z" });
  });

  it("si AODP falla (red o 5xx) se conserva lo anterior con su fecha y se informa del error", async () => {
    const t1 = new Date("2026-09-26T13:00:00Z");
    await mp.refreshPrices({ now: t1, servers: ["west"], fetchImpl: fetchWith(() => [row("T6_FIBER", "Thetford", 500, "2026-09-26T12:30:00")]) });
    const r = await mp.refreshPrices({ now: new Date("2026-09-26T14:00:00Z"), servers: ["west", "east"], fetchImpl: fetchWith((u) => u.includes("west.") ? 503 : new Error("ECONNRESET")) });
    expect(r.map((x) => [x.server, x.rows, Boolean(x.error)])).toEqual([["west", 0, true], ["east", 0, true]]);
    const { fetchedAt, prices } = await mp.getPrices("west", ["T6_FIBER"]);
    expect(fetchedAt).toBe(t1.toISOString());
    expect(prices.T6_FIBER.Thetford.sellMin).toBe(500);
  });

  it("un refresco parcial actualiza solo lo recibido; getPrices de un servidor vacío devuelve fetchedAt null", async () => {
    await mp.refreshPrices({ now: new Date("2026-09-26T15:00:00Z"), servers: ["west"], fetchImpl: fetchWith(() => [row("T6_FIBER", "Thetford", 520, "2026-09-26T14:50:00")]) });
    expect((await mp.getPrices("west", ["T6_FIBER"])).prices.T6_FIBER.Thetford.sellMin).toBe(520);
    expect(await mp.getPrices("east", ["T6_FIBER"])).toEqual({ fetchedAt: null, prices: {} });
  });
});
```

Run: `npx vitest run tests/db/prices.test.ts` — Expected: FAIL (`@/lib/market-prices` no existe).

- [ ] **Step 4: `src/lib/market-prices.ts`**

```ts
// src/lib/market-prices.ts
// Refresco horario de precios desde AODP y lectura desde Postgres. Cero
// peticiones a AODP por visita: la ficha y la API solo leen la tabla.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { GAME_SERVERS, RESOURCE_ITEM_IDS, USER_AGENT, aodpUrl, chunkIds, parsePrices, type GameServer } from "@/lib/aodp";

export type PriceCell = { sellMin: number | null; sellMinAt: string | null; buyMax: number | null; buyMaxAt: string | null };

export async function refreshPrices(opts: { fetchImpl?: typeof fetch; servers?: GameServer[]; now?: Date; ids?: string[] } = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const results: { server: GameServer; rows: number; error?: string }[] = [];
  for (const server of opts.servers ?? GAME_SERVERS) {
    let rows = 0;
    try {
      for (const ids of chunkIds(opts.ids ?? RESOURCE_ITEM_IDS)) {
        const res = await fetchImpl(aodpUrl(server, ids), { headers: { "user-agent": USER_AGENT, "accept-encoding": "gzip", accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`AODP ${server} HTTP ${res.status}`);
        const parsed = parsePrices(await res.json());
        // Solo se pisa lo que llega: si un lote falla, lo anterior sigue con su fecha.
        await prisma.$transaction(parsed.map((p) => prisma.marketPrice.upsert({
          where: { server_itemId_city: { server, itemId: p.itemId, city: p.city } },
          create: { server, itemId: p.itemId, city: p.city, sellMin: p.sellMin, sellMinAt: p.sellMinAt, buyMax: p.buyMax, buyMaxAt: p.buyMaxAt, fetchedAt: now },
          update: { sellMin: p.sellMin, sellMinAt: p.sellMinAt, buyMax: p.buyMax, buyMaxAt: p.buyMaxAt, fetchedAt: now },
        })));
        rows += parsed.length;
      }
      results.push({ server, rows });
    } catch (err) {
      results.push({ server, rows, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export async function getPrices(server: GameServer, itemIds: string[]): Promise<{ fetchedAt: string | null; prices: Record<string, Record<string, PriceCell>> }> {
  if (itemIds.length === 0) return { fetchedAt: null, prices: {} };
  const rows = await prisma.marketPrice.findMany({ where: { server, itemId: { in: itemIds } } });
  const prices: Record<string, Record<string, PriceCell>> = {};
  let latest: Date | null = null;
  for (const r of rows) {
    (prices[r.itemId] ??= {})[r.city] = { sellMin: r.sellMin, sellMinAt: r.sellMinAt?.toISOString() ?? null, buyMax: r.buyMax, buyMaxAt: r.buyMaxAt?.toISOString() ?? null };
    if (!latest || r.fetchedAt > latest) latest = r.fetchedAt;
  }
  return { fetchedAt: latest?.toISOString() ?? null, prices };
}

// Para la tarea de fondo: registra el resultado sin tirar el proceso.
export async function refreshPricesJob() {
  const r = await refreshPrices();
  for (const x of r) (x.error ? logger.warn : logger.info).call(logger, { server: x.server, rows: x.rows, error: x.error }, "aodp prices refresh");
}
```

Run: `npx vitest run tests/db/prices.test.ts` — Expected: 3 tests PASS.

- [ ] **Step 5: Tarea horaria en `src/instrumentation.ts` y `.env.example`**

Sustituye el contenido de `src/instrumentation.ts` por:

```ts
// Tareas de fondo del servidor Next (standalone). Solo en el runtime Node.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { purgeIdleGuests } = await import("@/lib/guest");
  const { refreshPricesJob } = await import("@/lib/market-prices");
  const { logger } = await import("@/lib/logger");
  const guests = async () => {
    try {
      const n = await purgeIdleGuests();
      if (n) logger.info({ n }, "idle guest accounts purged");
    } catch (err) {
      logger.warn({ err }, "guest purge failed");
    }
  };
  // Una vez al arrancar (con margen) y luego cada 6 h.
  setTimeout(guests, 60_000).unref();
  setInterval(guests, 6 * 60 * 60 * 1000).unref();

  // Precios AODP: a los 30 s de arrancar y luego cada hora (spec §7).
  // AODP_DISABLED=1 apaga la tarea (desarrollo sin red o self-host sin precios).
  if (process.env.AODP_DISABLED !== "1") {
    const prices = () => refreshPricesJob().catch((err) => logger.warn({ err }, "aodp prices refresh failed"));
    setTimeout(prices, 30_000).unref();
    setInterval(prices, 60 * 60 * 1000).unref();
  }
}
```

En `.env.example`, al final:

```
# === Precios de mercado (AODP, opcional) ===
# El servidor pide precios a albion-online-data.com cada hora (recursos T4–T8
# en las ciudades royal, Caerleon y Brecilien). AODP_DISABLED=1 lo apaga.
AODP_DISABLED=
```

`scripts/refresh-prices.ts` (para self-host y para el humo; `tsx` resuelve el alias `@/` desde `tsconfig.json`):

```ts
// scripts/refresh-prices.ts — refresco manual de la caché de precios de AODP.
//   DATABASE_URL=… npx tsx scripts/refresh-prices.ts
import { refreshPrices } from "../src/lib/market-prices";

refreshPrices().then((r) => {
  for (const x of r) console.log(`${x.server}: ${x.rows} filas${x.error ? ` — ERROR ${x.error}` : ""}`);
  process.exit(r.every((x) => !x.error) ? 0 : 1);
});
```

Run: `npx vitest run tests/lib/aodp.test.ts tests/db/prices.test.ts && npx tsc --noEmit -p .` — Expected: 9 tests PASS, tsc limpio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aodp.ts src/lib/market-prices.ts scripts/refresh-prices.ts prisma/schema.prisma src/instrumentation.ts .env.example tests/lib/aodp.test.ts tests/db/prices.test.ts
git commit -m "precios: caché horaria de AODP en MarketPrice (3 servidores, 7 ciudades, sin ceros ni precios sin fecha)"
```

### Task 4: API pública de zonas (`/api/v1/zones`, `/{nombre}`, `/{nombre}/prices`)

**Files:**
- Create: `src/lib/public-api.ts`, `src/lib/zone-prices.ts` (puro: lo importa un componente cliente), `src/lib/zone-prices-db.ts` (lee la BD), `src/lib/zone-public.ts`, `src/app/api/v1/zones/route.ts`, `src/app/api/v1/zones/[name]/route.ts`, `src/app/api/v1/zones/[name]/prices/route.ts`
- Modify: `README.md`, `README.en.md` (sección API pública)
- Test: `tests/lib/zones-api.test.ts` (sin BD), `tests/lib/zone-prices.test.ts`, `tests/db/prices.test.ts` (+1 test del endpoint de precios)

**Interfaces:**
- Consumes: `AVALON_ZONES`, `zoneBySlug`, `zoneSummaries`, `chestLootCategories`, `ZONES_SOURCE` (Tarea 2), `getPrices`, `resourceItemId`, `GAME_SERVERS`, `DEFAULT_SERVER`, `MARKET_CITIES` (Tarea 3).
- Produces (`src/lib/public-api.ts`): `publicApiGuard(req: Request): NextResponse | null` (60/min por IP → 429 con CORS) · `publicJson(data: unknown, opts?: { etag?: string; req?: Request; maxAge?: number }): NextResponse` (cabeceras `Access-Control-Allow-Origin: *`, `Cache-Control: public, s-maxage=3600, max-age=300, stale-while-revalidate=600`; con `etag` y `If-None-Match` igual → 304) · `publicNotFound(msg: string): NextResponse`.
- Produces (`src/lib/zone-public.ts`): `zoneIndexPayload(): { source: { commit: string }; zones: { name, slug, tier, family, hideout, resources, chests, dungeons }[] }` · `zoneIndexEtag(): string` · `zoneDetailPayload(z: AvalonZone): { name, slug, tier, family, zoneClass, hideout, resources, nodes, chests: (chest & { loot: {category, tiers}[] })[], dungeons, mobs, map, source, links: { web: string; prices: string } }`.
- Produces (`src/lib/zone-prices.ts`): `type Enchant = 0|1|2|3` · `zoneResourceTiers(z: AvalonZone): { resource: ResourceType; tier: number }[]` (tier ≥ 4, sin repetidos, ordenado por recurso y tier desc; si `nodes` está vacío, usa `resources` con el tier de la zona) · `type PriceLine = { itemId: string; resource: ResourceType; tier: number; enchant: Enchant; royalForge: string; cities: Record<string, PriceCell> }` · `priceLinesForZone(z: AvalonZone, prices: Record<string, Record<string, PriceCell>>, enchant: Enchant): PriceLine[]` · `bestCity(line: PriceLine, field: "sellMin" | "buyMax"): { city: string; value: number } | null`.
- Produces (`src/lib/zone-prices-db.ts`): `zonePricesPayload(z, server, enchant): Promise<{ zone, server, enchant, fetchedAt, cities, lines }>` (lee la caché con `getPrices` para los ids de la zona; `lines` = `priceLinesForZone`). Separado de `zone-prices.ts` para que el cliente no arrastre Prisma.
- Rutas: `GET /api/v1/zones` (ETag), `GET /api/v1/zones/{name}` (nombre o slug, 404 JSON), `GET /api/v1/zones/{name}/prices?server=europe&enchant=0` (400 si `server` o `enchant` no son válidos).

- [ ] **Step 1: Tests que fallan (sin BD)**

```ts
// tests/lib/zone-prices.test.ts
import { describe, it, expect } from "vitest";
import { zoneResourceTiers, priceLinesForZone, bestCity } from "@/lib/zone-prices";
import { AVALON_ZONES, type AvalonZone } from "@/lib/avalon-zones";

const casitos = AVALON_ZONES.find((z) => z.name === "Casitos-Atinaum")!;

describe("zoneResourceTiers", () => {
  it("nodos ≥ T4 sin repetir, recurso y tier descendente; ignora nodos T1–T3", () => {
    expect(zoneResourceTiers(casitos)).toEqual([
      { resource: "FIBER", tier: 7 }, { resource: "FIBER", tier: 6 }, { resource: "FIBER", tier: 5 },
      { resource: "HIDE", tier: 6 }, { resource: "HIDE", tier: 5 },
    ]);
  });
  it("zona con recursos pero sin nodos con tier usa el tier de la zona", () => {
    const z: AvalonZone = { ...casitos, nodes: [], resources: [{ type: "ORE", size: "large", count: 1 }] };
    expect(zoneResourceTiers(z)).toEqual([{ resource: "ORE", tier: 6 }]);
  });
  it("zona sin recolección → sin líneas", () => {
    expect(zoneResourceTiers({ ...casitos, nodes: [], resources: [] })).toEqual([]);
  });
});

describe("priceLinesForZone / bestCity", () => {
  const prices = { "T6_FIBER_LEVEL1@1": { Lymhurst: { sellMin: 900, sellMinAt: "2026-09-26T12:00:00.000Z", buyMax: 700, buyMaxAt: "2026-09-26T12:00:00.000Z" }, Caerleon: { sellMin: 1200, sellMinAt: "2026-09-26T09:00:00.000Z", buyMax: null, buyMaxAt: null } } };
  it("una línea por recurso y tier con el id encantado, enlace a Royal Forge y ciudades", () => {
    const lines = priceLinesForZone({ ...casitos, nodes: [{ type: "FIBER", tier: 6, count: 1 }] }, prices, 1);
    expect(lines).toEqual([{ itemId: "T6_FIBER_LEVEL1@1", resource: "FIBER", tier: 6, enchant: 1, royalForge: "https://royalforge.app/market/item/T6_FIBER_LEVEL1@1", cities: prices["T6_FIBER_LEVEL1@1"] }]);
    expect(bestCity(lines[0], "sellMin")).toEqual({ city: "Caerleon", value: 1200 });
    expect(bestCity(lines[0], "buyMax")).toEqual({ city: "Lymhurst", value: 700 });
  });
  it("sin precios cacheados: la línea existe con cities vacío y bestCity null", () => {
    const [line] = priceLinesForZone({ ...casitos, nodes: [{ type: "HIDE", tier: 5, count: 1 }] }, {}, 0);
    expect(line.cities).toEqual({});
    expect(bestCity(line, "sellMin")).toBeNull();
  });
});
```

```ts
// tests/lib/zones-api.test.ts
// API pública de zonas (plan fase 2, Tarea 4): índice con ETag, ficha, 404, CORS, límite por IP.
import { describe, it, expect } from "vitest";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers: { "x-forwarded-for": "10.2.2.2", ...headers } });

describe("GET /api/v1/zones", () => {
  it("400 zonas con CORS, caché pública y ETag; If-None-Match → 304", async () => {
    const { GET } = await import("@/app/api/v1/zones/route");
    const r = await GET(req("http://t/api/v1/zones"));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toContain("s-maxage=3600");
    const etag = r.headers.get("etag")!;
    expect(etag).toMatch(/^"[a-f0-9]{16,}"$/);
    const j = await r.json();
    expect(j.zones).toHaveLength(400);
    expect(j.zones.find((z: { name: string }) => z.name === "Casitos-Atinaum")).toMatchObject({ slug: "casitos-atinaum", tier: 6, family: "outlands", resources: ["FIBER"] });
    expect((await GET(req("http://t/api/v1/zones", { "if-none-match": etag }))).status).toBe(304);
  });
});

describe("GET /api/v1/zones/{name}", () => {
  it("acepta nombre o slug; trae bichos, botín por cofre y enlaces", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/route");
    const r = await GET(req("http://t/x"), { params: Promise.resolve({ name: "casitos-atinaum" }) });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.name).toBe("Casitos-Atinaum");
    expect(j.mobs.length).toBeGreaterThan(0);
    expect(j.chests.find((c: { type: string; size: string }) => c.type === "GREEN" && c.size === "small").loot[0]).toHaveProperty("category");
    expect(j.links).toEqual({ web: "https://avalontracker.app/zones/casitos-atinaum", prices: "https://avalontracker.app/api/v1/zones/casitos-atinaum/prices" });
    expect((await GET(req("http://t/x"), { params: Promise.resolve({ name: "Casitos-Atinaum" }) })).status).toBe(200);
  });
  it("zona inexistente → 404 JSON con CORS", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/route");
    const r = await GET(req("http://t/x"), { params: Promise.resolve({ name: "nope" }) });
    expect(r.status).toBe(404);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await r.json()).error.code).toBe("NOT_FOUND");
  });
  it("61 peticiones en un minuto desde la misma IP → 429", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/route");
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await GET(req("http://t/x", { "x-forwarded-for": "10.7.7.7" }), { params: Promise.resolve({ name: "casitos-atinaum" }) })).status;
    expect(last).toBe(429);
  });
});
```

Añade a `tests/db/prices.test.ts` (dentro de un `describe("GET /api/v1/zones/{name}/prices")` nuevo, tras los tests de `refreshPrices`):

```ts
  it("devuelve las líneas de la zona para el servidor pedido y valida server/enchant", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/prices/route");
    await mp.refreshPrices({ now: new Date("2026-09-26T16:00:00Z"), servers: ["europe"], fetchImpl: fetchWith(() => [row("T6_FIBER", "Lymhurst", 900, "2026-09-26T15:50:00", 700, "2026-09-26T15:50:00")]) });
    const call = (q: string, name = "casitos-atinaum") => GET(new Request(`http://t/x${q}`, { headers: { "x-forwarded-for": "10.3.3.3" } }), { params: Promise.resolve({ name }) });
    const r = await call("?server=europe");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("s-maxage=3600");
    const j = await r.json();
    expect(j.server).toBe("europe"); expect(j.enchant).toBe(0); expect(j.fetchedAt).toBe("2026-09-26T16:00:00.000Z");
    expect(j.lines.find((l: { itemId: string }) => l.itemId === "T6_FIBER").cities.Lymhurst.sellMin).toBe(900);
    expect((await call("")).status).toBe(200);                 // servidor por defecto: europe
    expect((await call("?server=mars")).status).toBe(400);
    expect((await call("?enchant=9")).status).toBe(400);
    expect((await call("?server=east", "nope")).status).toBe(404);
  });
```

Run: `npx vitest run tests/lib/zone-prices.test.ts tests/lib/zones-api.test.ts tests/db/prices.test.ts` — Expected: FAIL (módulos y rutas inexistentes).

- [ ] **Step 2: `src/lib/public-api.ts`**

```ts
// src/lib/public-api.ts
// Respuestas de la API pública de solo lectura: CORS abierto, caché de una
// hora, ETag opcional y límite de 60 peticiones por minuto e IP (spec §10).
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

export const publicLimiter = createLimiter({ windowMs: 60 * 1000, max: 60 });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type, if-none-match" };

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export function publicApiGuard(req: Request): NextResponse | null {
  const r = consumeToken(publicLimiter, clientIp(req));
  return r.ok ? null : withCors(apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: r.retryAfterMs }));
}

export function publicJson(data: unknown, opts: { etag?: string; req?: Request; maxAge?: number } = {}): NextResponse {
  const cache = `public, s-maxage=${opts.maxAge ?? 3600}, max-age=300, stale-while-revalidate=600`;
  if (opts.etag && opts.req?.headers.get("if-none-match") === opts.etag) {
    return withCors(new NextResponse(null, { status: 304, headers: { etag: opts.etag, "cache-control": cache } }));
  }
  const res = NextResponse.json(data, { headers: { "cache-control": cache, ...(opts.etag ? { etag: opts.etag } : {}) } });
  return withCors(res);
}

export function publicNotFound(message: string): NextResponse {
  return withCors(apiError("NOT_FOUND", 404, message));
}

export function publicBadRequest(message: string): NextResponse {
  return withCors(apiError("VALIDATION_ERROR", 400, message));
}
```

- [ ] **Step 3: `src/lib/zone-prices.ts`**

```ts
// src/lib/zone-prices.ts
// Qué líneas de precio enseña una zona: un recurso por tier de nodo (≥ T4),
// con el encantamiento elegido. Puro (sin BD): lo importa el cliente.
import type { AvalonZone, ResourceType } from "@/lib/avalon-zones";
import { resourceItemId } from "@/lib/aodp";
import type { PriceCell } from "@/lib/market-prices";

// Solo tipos de avalon-zones: importar un valor arrastraría las 400 zonas
// al bundle del cliente (ZonePrices es un componente cliente).
const RESOURCE_ORDER: ResourceType[] = ["ORE", "WOOD", "FIBER", "HIDE", "STONE"];

export type Enchant = 0 | 1 | 2 | 3;
export const ENCHANTS: Enchant[] = [0, 1, 2, 3];
export const ROYAL_FORGE_ITEM = (itemId: string) => `https://royalforge.app/market/item/${itemId}`;

export function zoneResourceTiers(z: AvalonZone): { resource: ResourceType; tier: number }[] {
  const out: { resource: ResourceType; tier: number }[] = [];
  for (const resource of RESOURCE_ORDER) {
    const tiers = new Set(z.nodes.filter((n) => n.type === resource && n.tier >= 4).map((n) => n.tier));
    // Sin nodos con tier (dato ausente en el dump): el tier de la zona.
    if (tiers.size === 0 && z.nodes.length === 0 && z.resources.some((r) => r.type === resource) && z.tier >= 4) tiers.add(z.tier);
    for (const tier of [...tiers].sort((a, b) => b - a)) out.push({ resource, tier });
  }
  return out;
}

export type PriceLine = { itemId: string; resource: ResourceType; tier: number; enchant: Enchant; royalForge: string; cities: Record<string, PriceCell> };

export function priceLinesForZone(z: AvalonZone, prices: Record<string, Record<string, PriceCell>>, enchant: Enchant): PriceLine[] {
  return zoneResourceTiers(z).map(({ resource, tier }) => {
    const itemId = resourceItemId(resource, tier, enchant);
    return { itemId, resource, tier, enchant, royalForge: ROYAL_FORGE_ITEM(itemId), cities: prices[itemId] ?? {} };
  });
}

export function bestCity(line: PriceLine, field: "sellMin" | "buyMax"): { city: string; value: number } | null {
  let best: { city: string; value: number } | null = null;
  for (const [city, cell] of Object.entries(line.cities)) {
    const v = cell[field];
    if (v !== null && (!best || v > best.value)) best = { city, value: v };
  }
  return best;
}

```

```ts
// src/lib/zone-prices-db.ts
// Carga de precios de una zona desde la caché (servidor). Separado de
// zone-prices.ts para que el componente cliente no importe Prisma.
import type { AvalonZone } from "@/lib/avalon-zones";
import { MARKET_CITIES, resourceItemId, type GameServer } from "@/lib/aodp";
import { getPrices } from "@/lib/market-prices";
import { priceLinesForZone, zoneResourceTiers, type Enchant } from "@/lib/zone-prices";

export async function zonePricesPayload(z: AvalonZone, server: GameServer, enchant: Enchant) {
  const ids = zoneResourceTiers(z).map(({ resource, tier }) => resourceItemId(resource, tier, enchant));
  const { fetchedAt, prices } = await getPrices(server, ids);
  return { zone: z.name, server, enchant, fetchedAt, cities: [...MARKET_CITIES], lines: priceLinesForZone(z, prices, enchant) };
}
```

Run: `npx vitest run tests/lib/zone-prices.test.ts` — Expected: 5 tests PASS.

- [ ] **Step 4: `src/lib/zone-public.ts` y las tres rutas**

```ts
// src/lib/zone-public.ts
// Forma pública (JSON) de las zonas para /api/v1/zones. Solo datos del dump.
import crypto from "node:crypto";
import { AVALON_ZONES, ZONES_SOURCE, zoneSlug, zoneFamily, zoneSummaries, chestLootCategories, type AvalonZone } from "@/lib/avalon-zones";

const SITE = "https://avalontracker.app";

export function zoneIndexPayload() {
  return {
    source: { commit: ZONES_SOURCE.commit, dump: "ao-data/ao-bin-dumps" },
    zones: zoneSummaries().map((s) => ({ name: s.n, slug: s.s, tier: s.t, family: s.f, hideout: s.h, resources: s.r, chests: s.c, dungeons: s.d })),
  };
}

let indexEtag: string | null = null;
export function zoneIndexEtag(): string {
  indexEtag ??= `"${crypto.createHash("sha256").update(JSON.stringify(zoneIndexPayload())).digest("hex").slice(0, 32)}"`;
  return indexEtag;
}

export function zoneDetailPayload(z: AvalonZone) {
  const slug = zoneSlug(z.name);
  return {
    name: z.name, slug, tier: z.tier, family: zoneFamily(z.zoneClass), zoneClass: z.zoneClass, hideout: z.hasHideout,
    resources: z.resources, nodes: z.nodes,
    chests: z.chests.map((c) => ({ ...c, loot: chestLootCategories(c.type, c.size, c.tier) })),
    dungeons: z.dungeons, mobs: z.mobs, map: z.map,
    source: { commit: ZONES_SOURCE.commit, dump: "ao-data/ao-bin-dumps" },
    links: { web: `${SITE}/zones/${slug}`, prices: `${SITE}/api/v1/zones/${slug}/prices` },
  };
}

export const zoneCount = () => AVALON_ZONES.length;
```

```ts
// src/app/api/v1/zones/route.ts
import { publicApiGuard, publicJson } from "@/lib/public-api";
import { zoneIndexPayload, zoneIndexEtag } from "@/lib/zone-public";

// Índice público de las 400 zonas (spec §7). Sin cuenta; caché 1 h; ETag.
export async function GET(req: Request) {
  const blocked = publicApiGuard(req);
  if (blocked) return blocked;
  return publicJson(zoneIndexPayload(), { etag: zoneIndexEtag(), req });
}
```

```ts
// src/app/api/v1/zones/[name]/route.ts
import { publicApiGuard, publicJson, publicNotFound } from "@/lib/public-api";
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
```

```ts
// src/app/api/v1/zones/[name]/prices/route.ts
import { publicApiGuard, publicJson, publicNotFound, publicBadRequest } from "@/lib/public-api";
import { internalError } from "@/lib/api-error";
import { zoneBySlug } from "@/lib/avalon-zones";
import { DEFAULT_SERVER, GAME_SERVERS, type GameServer } from "@/lib/aodp";
import { ENCHANTS, type Enchant } from "@/lib/zone-prices";
import { zonePricesPayload } from "@/lib/zone-prices-db";

// Precios (caché de AODP) de los recursos de una zona: ?server=west|europe|east
// (por defecto europe) y ?enchant=0..3. Nunca llama a AODP (spec §7).
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const blocked = publicApiGuard(req);
  if (blocked) return blocked;
  const z = zoneBySlug((await params).name);
  if (!z) return publicNotFound("Zona desconocida");
  const q = new URL(req.url).searchParams;
  const server = (q.get("server") ?? DEFAULT_SERVER) as GameServer;
  if (!GAME_SERVERS.includes(server)) return publicBadRequest("server debe ser west, europe o east");
  const enchant = Number(q.get("enchant") ?? 0) as Enchant;
  if (!ENCHANTS.includes(enchant)) return publicBadRequest("enchant debe ser 0, 1, 2 o 3");
  try {
    return publicJson(await zonePricesPayload(z, server, enchant), { req });
  } catch (err) { return internalError(err); }
}
```

Run: `npx vitest run tests/lib/zones-api.test.ts tests/db/prices.test.ts` — Expected: 4 + 4 tests PASS. Si el test del 304 falla por el nombre de la cabecera, comprueba que `NextResponse` conserva `etag` en minúsculas (`r.headers.get` no distingue mayúsculas).

- [ ] **Step 5: README (ES y EN)**

En `README.md`, dentro de «## API Endpoints (resumen)», antes de «### Sesión / usuario», añade:

```markdown
### API pública de zonas — sin cuenta, solo lectura, CORS abierto, 60 peticiones/min por IP

- `GET /api/v1/zones` — índice de las 400 zonas (nombre, slug, tier, familia, recursos, cofres, mazmorras). `ETag`; caché 1 h.
- `GET /api/v1/zones/{nombre|slug}` — ficha completa: recursos con tier de nodo, cofres con categorías de botín (sin porcentajes), mazmorras, bichos, minimapa esquemático.
- `GET /api/v1/zones/{nombre|slug}/prices?server=europe&enchant=0` — precios de los recursos de la zona en Lymhurst, Martlock, Thetford, Bridgewatch, Fort Sterling, Caerleon y Brecilien, desde la caché horaria de [AODP](https://www.albion-online-data.com/) (`sellMin` = oferta de venta más baja, `buyMax` = mejor orden de compra; `null` = sin dato; `fetchedAt` = última descarga). Servidores: `west`, `europe`, `east`.

Datos del juego © Sandbox Interactive, vía `ao-data/ao-bin-dumps`; precios del Albion Online Data Project. Si construyes algo con esta API, cítala.
```

En `README.en.md`, en la sección equivalente, la traducción:

```markdown
### Public zones API — no account, read-only, open CORS, 60 requests/min per IP

- `GET /api/v1/zones` — index of all 400 zones (name, slug, tier, family, resources, chests, dungeons). `ETag`; cached 1 h.
- `GET /api/v1/zones/{name|slug}` — full zone: resources with node tiers, chests with loot categories (no percentages), dungeons, mobs, schematic mini-map.
- `GET /api/v1/zones/{name|slug}/prices?server=europe&enchant=0` — prices for the zone's resources in Lymhurst, Martlock, Thetford, Bridgewatch, Fort Sterling, Caerleon and Brecilien, from the hourly [AODP](https://www.albion-online-data.com/) cache (`sellMin` = lowest sell order, `buyMax` = best buy order; `null` = no data; `fetchedAt` = last download). Servers: `west`, `europe`, `east`.

Game data © Sandbox Interactive via `ao-data/ao-bin-dumps`; prices from the Albion Online Data Project. If you build on this API, credit it.
```

- [ ] **Step 6: Verificar y commit**

Run: `npx vitest run tests/lib && npx tsc --noEmit -p .` — Expected: todo PASS, tsc limpio.

```bash
git add src/lib/public-api.ts src/lib/zone-prices.ts src/lib/zone-prices-db.ts src/lib/zone-public.ts src/app/api/v1/zones README.md README.en.md tests/lib/zone-prices.test.ts tests/lib/zones-api.test.ts tests/db/prices.test.ts
git commit -m "API pública de zonas: índice con ETag, ficha con bichos y botín, precios por servidor; CORS y 60/min por IP"
```

### Task 5: Ficha de zona — bichos, botín por cofre y precios (EN + ES)

**Files:**
- Create: `src/components/zones/ZoneMobs.tsx`, `src/components/zones/ZoneChestLoot.tsx`, `src/components/zones/ZonePrices.tsx`
- Modify: `src/lib/mobs.ts` (`mobLabel`, `sortMobs`), `src/i18n/public.ts` (textos nuevos EN y ES), `src/components/zones/pages.tsx` (secciones nuevas, enlace a `/exits?from=`)
- Test: `tests/lib/mobs.test.ts` (+1)

**Interfaces:**
- Consumes: `ZoneMob` (Tarea 1), `chestLootCategories`, `AvalonZone.chests[].tier` (Tarea 2), `GAME_SERVERS`, `DEFAULT_SERVER` (Tarea 3), `ENCHANTS`, `bestCity`, `PriceLine`, `zonePricesPayload` (Tarea 4).
- Produces: `mobLabel(m: ZoneMob, t: PublicT): string` · `sortMobs(mobs: ZoneMob[]): ZoneMob[]` (critters → guardianes → miniguardianes → animales → otros) · `<ZoneMobs mobs t />` · `<ZoneChestLoot zone t />` (devuelve `null` si ningún cofre tiene tabla) · `<ZonePrices slug lang initial nearestCity? />` (cliente; `initial: PricesPayload | null`; con `initial` null pide la API al montar; con `nearestCity` añade la columna «más cercana») · `type PricesPayload = Awaited<ReturnType<typeof zonePricesPayload>>`.

- [ ] **Step 1: Test de etiquetas y orden que falla**

Añade a `tests/lib/mobs.test.ts`:

```ts
import { mobLabel, sortMobs } from "@/lib/mobs";
import { publicT } from "@/i18n/public";

describe("mobLabel / sortMobs", () => {
  it("etiquetas en inglés y en castellano", () => {
    const en = publicT("en"); const es = publicT("es");
    expect(mobLabel({ kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 1 }, en)).toBe("T5 Ore critters (veteran)");
    expect(mobLabel({ kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 1 }, es)).toBe("Bichos de Mineral T5 (veteranos)");
    expect(mobLabel({ kind: "guardian", name: "ent", tier: 8, count: 1 }, en)).toBe("Ent guardian T8");
    expect(mobLabel({ kind: "animal", name: "bear", tier: null, count: 2 }, en)).toBe("Bears");
    expect(mobLabel({ kind: "animal", name: "direboar", tier: 7, count: 2 }, en)).toBe("Direboars T7");
    expect(mobLabel({ kind: "other", name: "T9_MOB_X", count: 1 }, en)).toBe("T9_MOB_X");
  });
  it("orden: critters (recurso, tier alto primero), guardianes, miniguardianes, animales, otros", () => {
    const out = sortMobs([
      { kind: "animal", name: "bear", tier: null, count: 1 },
      { kind: "critter", resource: "WOOD", tier: 5, rank: "elite", count: 1 },
      { kind: "miniguardian", name: "ent", tier: 6, count: 1 },
      { kind: "critter", resource: "ORE", tier: 7, rank: "veteran", count: 1 },
      { kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 1 },
      { kind: "guardian", name: "dryad", tier: 8, count: 1 },
    ]);
    expect(out.map((m) => (m.kind === "critter" ? `${m.resource}${m.tier}` : m.kind))).toEqual(["ORE7", "ORE5", "WOOD5", "guardian", "miniguardian", "animal"]);
  });
});
```

Run: `npx vitest run tests/lib/mobs.test.ts` — Expected: FAIL (`mobLabel` no exportado).

- [ ] **Step 2: `mobLabel` y `sortMobs` en `src/lib/mobs.ts`**

```ts
import type { PublicKey, PublicT } from "@/i18n/public";

const KIND_ORDER: Record<ZoneMob["kind"], number> = { critter: 0, guardian: 1, miniguardian: 2, animal: 3, other: 4 };
const RES_ORDER = ["ORE", "WOOD", "FIBER", "HIDE", "STONE"];

export function mobLabel(m: ZoneMob, t: PublicT): string {
  switch (m.kind) {
    case "critter": return t("mob.critter", { tier: m.tier, res: t(`res.${m.resource}` as PublicKey), rank: t(`mob.rank.${m.rank}` as PublicKey) });
    case "animal": { const n = t(`mob.animal.${m.name}` as PublicKey); return m.tier ? `${n} T${m.tier}` : n; }
    case "guardian": return t("mob.guardian", { name: t(`mob.guardian.${m.name}` as PublicKey), tier: m.tier });
    case "miniguardian": return t("mob.miniguardian", { name: t(`mob.guardian.${m.name}` as PublicKey), tier: m.tier });
    default: return m.name;
  }
}

export function sortMobs(mobs: ZoneMob[]): ZoneMob[] {
  const key = (m: ZoneMob) => m.kind === "critter" ? [RES_ORDER.indexOf(m.resource), 9 - m.tier, m.rank] : "name" in m ? [0, 0, m.name] : [0, 0, ""];
  return [...mobs].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || String(key(a)).localeCompare(String(key(b))));
}
```

(`import type` de `@/i18n/public` no arrastra el diccionario al extractor: solo tipos.)

- [ ] **Step 3: Textos EN y ES en `src/i18n/public.ts`**

En `en` (y su traducción en `es`, que `tsc` exige completa por `Record<PublicKey, string>`):

```ts
  // EN
  "zone.mobs": "Mobs",
  "zone.mobs.none": "No mobs in the game files for this zone.",
  "zone.mobs.note": "Spawn slots from the game files, not live population.",
  "mob.critter": "T{tier} {res} critters ({rank})",
  "mob.rank.veteran": "veteran",
  "mob.rank.elite": "elite",
  "mob.animal.bear": "Bears",
  "mob.animal.boar": "Boars",
  "mob.animal.direwolf": "Direwolves",
  "mob.animal.wolpertinger": "Wolpertingers",
  "mob.animal.direboar": "Direboars",
  "mob.animal.direbear": "Direbears",
  "mob.guardian": "{name} guardian T{tier}",
  "mob.miniguardian": "{name} mini-guardian T{tier}",
  "mob.guardian.basilisk": "Basilisk",
  "mob.guardian.dryad": "Dryad",
  "mob.guardian.ent": "Ent",
  "mob.guardian.oregiant": "Ore giant",
  "mob.guardian.rockgiant": "Rock giant",
  "zone.loot": "What can drop from the chests",
  "zone.loot.note": "Categories in the order the game files weight them, most likely first, across the chest's base, champion and boss variants. No percentages: the game does not document them.",
  "loot.gear": "Equipment",
  "loot.artefacts": "Avalonian artefacts",
  "loot.fragments": "Avalonian fragments",
  "loot.fame_books": "Tomes of Insight (fame)",
  "loot.treasures": "Treasures (vendor loot)",
  "loot.tokens": "Dungeon maps and expedition tokens",
  "loot.silver": "Silver",
  "zone.prices": "Market prices for what you gather here",
  "zone.prices.none": "No gathering nodes here, so nothing to price.",
  "prices.server": "Server",
  "prices.server.west": "Americas",
  "prices.server.europe": "Europe",
  "prices.server.east": "Asia",
  "prices.enchant": "Enchantment",
  "prices.item": "Resource",
  "prices.nearest": "Nearest: {city}",
  "prices.sell": "Sell order (lowest)",
  "prices.buy": "Buy order (best)",
  "prices.all": "All cities",
  "prices.nodata": "no data",
  "prices.updated": "Prices from the Albion Online Data Project, last download {when}.",
  "prices.empty": "No prices downloaded yet for this server. Try again in an hour.",
  "prices.loading": "Loading prices…",
  "prices.error": "Prices are unavailable right now.",
  "prices.royalforge": "Royal Forge",
  "prices.note": "Crowd-sourced by players running the AODP client: a guide, not a quote.",
  "exits.sell.title": "Where to sell",
  "exits.sell.origin": "Avalon zone where you gathered (optional)",
  "exits.sell.hint": "Compares the nearest market with the city that pays best right now.",
```

```ts
  // ES
  "zone.mobs": "Bichos",
  "zone.mobs.none": "Sin bichos en los ficheros del juego para esta zona.",
  "zone.mobs.note": "Puntos de aparición según los ficheros del juego, no la población en vivo.",
  "mob.critter": "Bichos de {res} T{tier} ({rank})",
  "mob.rank.veteran": "veteranos",
  "mob.rank.elite": "élite",
  "mob.animal.bear": "Osos",
  "mob.animal.boar": "Jabalíes",
  "mob.animal.direwolf": "Lobos huargo",
  "mob.animal.wolpertinger": "Wolpertingers",
  "mob.animal.direboar": "Jabalíes huargo",
  "mob.animal.direbear": "Osos huargo",
  "mob.guardian": "Guardián {name} T{tier}",
  "mob.miniguardian": "Miniguardián {name} T{tier}",
  "mob.guardian.basilisk": "Basilisco",
  "mob.guardian.dryad": "Dríade",
  "mob.guardian.ent": "Ent",
  "mob.guardian.oregiant": "Gigante de mineral",
  "mob.guardian.rockgiant": "Gigante de roca",
  "zone.loot": "Qué puede salir de los cofres",
  "zone.loot.note": "Categorías en el orden en que las ponderan los ficheros del juego, de más a menos probable, uniendo las variantes base, campeón y jefe del cofre. Sin porcentajes: el juego no los documenta.",
  "loot.gear": "Equipo",
  "loot.artefacts": "Artefactos avalonianos",
  "loot.fragments": "Fragmentos avalonianos",
  "loot.fame_books": "Tomos de conocimiento (fama)",
  "loot.treasures": "Tesoros (para vender)",
  "loot.tokens": "Mapas de mazmorra y fichas de expedición",
  "loot.silver": "Plata",
  "zone.prices": "Precios de lo que se recolecta aquí",
  "zone.prices.none": "Aquí no hay nodos de recolección: nada que tasar.",
  "prices.server": "Servidor",
  "prices.server.west": "América",
  "prices.server.europe": "Europa",
  "prices.server.east": "Asia",
  "prices.enchant": "Encantamiento",
  "prices.item": "Recurso",
  "prices.nearest": "Más cercana: {city}",
  "prices.sell": "Oferta de venta (más baja)",
  "prices.buy": "Orden de compra (mejor)",
  "prices.all": "Todas las ciudades",
  "prices.nodata": "sin datos",
  "prices.updated": "Precios del Albion Online Data Project, última descarga {when}.",
  "prices.empty": "Aún no hay precios descargados para este servidor. Prueba dentro de una hora.",
  "prices.loading": "Cargando precios…",
  "prices.error": "Los precios no están disponibles ahora mismo.",
  "prices.royalforge": "Royal Forge",
  "prices.note": "Aportados por jugadores con el cliente de AODP: orientación, no cotización.",
  "exits.sell.title": "Dónde vender",
  "exits.sell.origin": "Zona de Avalon donde recolectaste (opcional)",
  "exits.sell.hint": "Compara el mercado más cercano con la ciudad que mejor paga ahora mismo.",
```

Y cambia tres textos existentes (EN / ES):

- `zones.metaDesc`: "Look up any Roads of Avalon zone in Albion Online: tier, resources with node tiers, chest spawns (gold, blue, green) with what can drop, mobs, today's market prices, dungeons and a mini-map. No account needed." / "Consulta cualquier zona de los Caminos de Avalon de Albion Online: tier, recursos con el tier de cada nodo, cofres (oro, azul, verde) con lo que puede salir, bichos, precios de mercado de hoy, mazmorras y minimapa. Sin cuenta."
- `zone.metaDesc`: "{name} (Roads of Avalon, T{tier}): {resources}; {chests}; {dungeons}. Mobs, chest loot, today's market prices, mini-map and similar zones." / "{name} (Caminos de Avalon, T{tier}): {resources}; {chests}; {dungeons}. Bichos, botín de los cofres, precios de mercado de hoy, minimapa y zonas parecidas."
- `zone.exits.body`: "Road portals are random and expire, so no zone has fixed exits. When you come out of Avalon, look up the zone you land in to see the nearest royal city and where your haul sells best." / "Los portales de los Caminos son aleatorios y caducan: ninguna zona tiene salidas fijas. Cuando salgas de Avalon, busca la zona a la que llegas y verás la ciudad royal más cercana y dónde se paga mejor lo que traes."

Run: `npx vitest run tests/lib/mobs.test.ts && npx tsc --noEmit -p .` — Expected: PASS (si `tsc` señala una clave que falta en `es`, añádela: el `Record<PublicKey, string>` es la red).

- [ ] **Step 4: `ZoneMobs.tsx` y `ZoneChestLoot.tsx` (servidor)**

```tsx
// src/components/zones/ZoneMobs.tsx
import { mobLabel, sortMobs, type ZoneMob } from "@/lib/mobs";
import type { PublicT } from "@/i18n/public";
import { RESOURCE_COLOR } from "./ZoneMiniMap";

export function ZoneMobs({ mobs, t }: { mobs: ZoneMob[]; t: PublicT }) {
  if (mobs.length === 0) return <p className="text-sm text-slate-400">{t("zone.mobs.none")}</p>;
  return (
    <>
      <ul className="space-y-1.5 text-sm" data-testid="zone-mobs">
        {sortMobs(mobs).map((m) => (
          <li key={mobLabel(m, t)} className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 ${m.kind === "critter" ? "rounded-full" : m.kind === "animal" ? "rounded-full bg-slate-500" : "rotate-45 bg-amber-400"}`} style={m.kind === "critter" ? { backgroundColor: RESOURCE_COLOR[m.resource] } : undefined} />
            <span className="text-white">{m.count}× {mobLabel(m, t)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{t("zone.mobs.note")}</p>
    </>
  );
}
```

```tsx
// src/components/zones/ZoneChestLoot.tsx
import { CHEST_TYPES, chestLootCategories, type AvalonZone } from "@/lib/avalon-zones";
import type { PublicKey, PublicT } from "@/i18n/public";
import { CHEST_COLOR } from "./ZoneMiniMap";

// Qué puede salir de cada cofre de la zona (categorías ordenadas, sin
// porcentajes: spec §7). Cofre sin tabla → no se lista.
export function ZoneChestLoot({ zone, t }: { zone: AvalonZone; t: PublicT }) {
  const chests = CHEST_TYPES.flatMap((c) => zone.chests.filter((x) => x.type === c))
    .map((c) => ({ ...c, loot: chestLootCategories(c.type, c.size, c.tier) }))
    .filter((c) => c.loot.length > 0);
  if (chests.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4" data-testid="zone-loot">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("zone.loot")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {chests.map((c) => (
          <div key={`${c.type}-${c.size}-${c.tier}`}>
            <p className="flex items-center gap-2 text-sm text-white">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: CHEST_COLOR[c.type] }} />
              {c.count}× {t(`chest.${c.type}` as PublicKey)} <span className="text-slate-400">({t(`size.${c.size}` as PublicKey)} · T{c.tier})</span>
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-6 text-sm text-slate-300">
              {c.loot.map((l) => (
                <li key={l.category}>
                  {t(`loot.${l.category}` as PublicKey)}
                  {l.tiers.length > 0 && <span className="text-slate-500"> · {l.tiers.map((x) => `T${x}`).join(", ")}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t("zone.loot.note")}</p>
    </section>
  );
}
```

- [ ] **Step 5: `ZonePrices.tsx` (cliente)**

```tsx
// src/components/zones/ZonePrices.tsx
"use client";
import { Fragment, useEffect, useState } from "react";
import { publicT, type PublicKey, type PublicLang } from "@/i18n/public";
import { DEFAULT_SERVER, GAME_SERVERS, type GameServer } from "@/lib/aodp";
import { ENCHANTS, bestCity, type Enchant, type PriceLine } from "@/lib/zone-prices";

export type PricesPayload = { zone: string; server: GameServer; enchant: Enchant; fetchedAt: string | null; cities: string[]; lines: PriceLine[] };

const STORAGE = "at.server";
const MONTHS = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] };
// Formato fijo en UTC: el mismo en servidor y navegador (sin desajuste de hidratación).
function whenUtc(iso: string, lang: PublicLang) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[lang][d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// Precios de los recursos de una zona: servidor (recordado en el navegador)
// y encantamiento. Con `initial` pinta sin esperar; cualquier cambio pide
// /api/v1/zones/<slug>/prices (caché de AODP; nunca AODP en directo).
export function ZonePrices({ slug, lang, initial, nearestCity }: { slug: string; lang: PublicLang; initial: PricesPayload | null; nearestCity?: string }) {
  const t = publicT(lang);
  const [server, setServer] = useState<GameServer>(initial?.server ?? DEFAULT_SERVER);
  const [enchant, setEnchant] = useState<Enchant>(initial?.enchant ?? 0);
  const [data, setData] = useState<PricesPayload | null>(initial);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [expanded, setExpanded] = useState<string | null>(null);
  const nf = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US");

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE); if (s && (GAME_SERVERS as string[]).includes(s)) setServer(s as GameServer); } catch { /* sin almacenamiento */ }
  }, []);

  useEffect(() => {
    if (data && data.server === server && data.enchant === enchant) return;
    const ctrl = new AbortController();
    setState("loading");
    fetch(`/api/v1/zones/${encodeURIComponent(slug)}/prices?server=${server}&enchant=${enchant}`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<PricesPayload>; })
      .then((j) => { setData(j); setState("idle"); })
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setState("error"); });
    return () => ctrl.abort();
  }, [slug, server, enchant]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (s: GameServer) => { setServer(s); try { localStorage.setItem(STORAGE, s); } catch { /* sin almacenamiento */ } };
  const lines = data?.lines ?? [];
  const cols = nearestCity ? 5 : 4;
  const num = (v: number | null | undefined) => (v == null ? <span className="text-slate-500">{t("prices.nodata")}</span> : nf.format(v));

  return (
    <div data-testid="zone-prices" data-server={server}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Choice label={t("prices.server")} value={server} options={GAME_SERVERS.map((s) => [s, t(`prices.server.${s}` as PublicKey)])} onChange={(v) => pick(v as GameServer)} />
        <Choice label={t("prices.enchant")} value={String(enchant)} options={ENCHANTS.map((e) => [String(e), `.${e}`])} onChange={(v) => setEnchant(Number(v) as Enchant)} />
      </div>
      {state === "error" && <p className="mt-3 text-sm text-amber-300">{t("prices.error")}</p>}
      {data && lines.length === 0 && <p className="mt-3 text-sm text-slate-400">{t("zone.prices.none")}</p>}
      {lines.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-semibold">{t("prices.item")}</th>
                {nearestCity && <th className="py-1 pr-3 font-semibold">{t("prices.nearest", { city: nearestCity })}</th>}
                <th className="py-1 pr-3 font-semibold">{t("prices.sell")}</th>
                <th className="py-1 pr-3 font-semibold">{t("prices.buy")}</th>
                <th />
              </tr>
            </thead>
            <tbody className={state === "loading" ? "opacity-50" : undefined}>
              {lines.map((l) => {
                const sell = bestCity(l, "sellMin"); const buy = bestCity(l, "buyMax"); const open = expanded === l.itemId;
                return (
                  <Fragment key={l.itemId}>
                    <tr className="border-t border-slate-800" data-testid="price-line">
                      <td className="py-1.5 pr-3 text-white">{t(`res.${l.resource}` as PublicKey)} T{l.tier}{l.enchant ? `.${l.enchant}` : ""}</td>
                      {nearestCity && <td className="py-1.5 pr-3 text-slate-300">{num(l.cities[nearestCity]?.sellMin)}</td>}
                      <td className="py-1.5 pr-3 text-slate-300">{sell ? <>{nf.format(sell.value)} <span className="text-slate-500">· {sell.city}</span></> : num(null)}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{buy ? <>{nf.format(buy.value)} <span className="text-slate-500">· {buy.city}</span></> : num(null)}</td>
                      <td className="whitespace-nowrap py-1.5 text-xs">
                        <button type="button" onClick={() => setExpanded(open ? null : l.itemId)} aria-expanded={open} className="text-indigo-300 hover:text-indigo-200">{t("prices.all")}</button>
                        <a href={l.royalForge} target="_blank" rel="noopener noreferrer" className="ml-3 text-indigo-300 hover:text-indigo-200">{t("prices.royalforge")} ↗</a>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-950/40">
                        <td colSpan={cols} className="px-2 py-2">
                          <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                            {(data?.cities ?? []).map((c) => (
                              <li key={c} className="flex justify-between gap-2">
                                <span className="text-slate-400">{c}</span>
                                <span className="text-slate-200">{l.cities[c]?.sellMin == null ? "—" : nf.format(l.cities[c].sellMin!)} / {l.cities[c]?.buyMax == null ? "—" : nf.format(l.cities[c].buyMax!)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {data?.fetchedAt ? t("prices.updated", { when: whenUtc(data.fetchedAt, lang) }) : data ? t("prices.empty") : state === "error" ? "" : t("prices.loading")} {t("prices.note")}
      </p>
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-slate-500">{label}</span>
      {options.map(([v, text]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={v === value} className={`rounded-md px-2 py-0.5 ${v === value ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{text}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Integración en `src/components/zones/pages.tsx`**

Imports nuevos: `import { ZoneMobs } from "./ZoneMobs"; import { ZoneChestLoot } from "./ZoneChestLoot"; import { ZonePrices } from "./ZonePrices"; import { zonePricesPayload } from "@/lib/zone-prices-db"; import { DEFAULT_SERVER } from "@/lib/aodp";`.

En `ZonePage`, tras `const similar = similarZones(z);`:

```tsx
  // Precios del servidor por defecto para pintar sin esperar; si la BD no
  // responde, el componente cliente los pide a la API al montar.
  const initialPrices = await zonePricesPayload(z, DEFAULT_SERVER, 0).catch(() => null);
```

Tras la tarjeta de mazmorras (dentro del `div.flex.flex-col.gap-4`):

```tsx
          <Card title={t("zone.mobs")}>
            <ZoneMobs mobs={z.mobs} t={t} />
          </Card>
```

Tras el `div.grid` de dos columnas y antes del bloque de CTA:

```tsx
      <ZoneChestLoot zone={z} t={t} />

      <section id="prices" className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("zone.prices")}</h2>
        <ZonePrices slug={slug} lang={lang} initial={initialPrices} />
      </section>
```

Y el enlace de «¿Adónde lleva?» pasa a `href={publicPath(lang, `/exits?from=${encodeURIComponent(z.name)}`)}`.

Run: `npx tsc --noEmit -p . && npm run lint` — Expected: limpio. Arranca `AODP_DISABLED=1 npx next dev -p 3111` con `DATABASE_URL` de PGlite (`postgresql://postgres@127.0.0.1:54329/postgres?sslmode=disable`, servidor de `tests/db/pglite-server.ts`, `npx prisma db push` antes) y abre `http://localhost:3111/zones/casitos-atinaum` y `/es/zones/casitos-atinaum`: tres secciones nuevas visibles; sin precios descargados se lee «No prices downloaded yet…» y el selector de servidor sigue funcionando (pide la API y muestra el mismo aviso). Captura con Playwright (`shot/shot.mjs` del scratchpad) y **mírala** (regla de la casa: revisar cada imagen).

- [ ] **Step 7: Commit**

```bash
git add src/lib/mobs.ts src/i18n/public.ts src/components/zones/ZoneMobs.tsx src/components/zones/ZoneChestLoot.tsx src/components/zones/ZonePrices.tsx src/components/zones/pages.tsx tests/lib/mobs.test.ts
git commit -m "ficha de zona: bichos, qué puede salir de cada cofre y precios de mercado por servidor y encantamiento (EN/ES)"
```

### Task 6: «Dónde vender» en /exits

**Files:**
- Modify: `src/components/zones/ExitFinder.tsx`, `src/components/zones/pages.tsx` (`ExitsPage` recibe `from`), `src/app/exits/page.tsx`, `src/app/es/exits/page.tsx`

**Interfaces:**
- Consumes: `<ZonePrices slug lang initial={null} nearestCity />` (Tarea 5), `ZoneSuggest` (existente), `nearestRoyalCity` (existente).
- Produces: `ExitsPage({ lang, from }: { lang: PublicLang; from?: string })` · `ExitFinder({ lang, avalonNames, from })`.

- [ ] **Step 1: Rutas y `ExitsPage` con `from`**

`src/app/exits/page.tsx`:

```tsx
import { ExitsPage, exitsMetadata } from "@/components/zones/pages";

export const metadata = exitsMetadata("en");

// ?from=<zona de Avalon> preselecciona la zona de origen para «dónde vender».
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <ExitsPage lang="en" from={(await searchParams).from} />;
}
```

`src/app/es/exits/page.tsx`: igual con `"es"`. En `pages.tsx`, `ExitsPage({ lang, from }: { lang: PublicLang; from?: string })` pasa `from={from}` a `ExitFinder`.

- [ ] **Step 2: Origen y bloque de precios en `ExitFinder.tsx`**

Imports nuevos: `import { ZoneSuggest } from "./ZoneSuggest"; import { ZonePrices } from "./ZonePrices";`.

En `ExitFinder`, props `{ lang, avalonNames, from }: { lang: PublicLang; avalonNames: string[]; from?: string }` y estado:

```tsx
  const [origin, setOrigin] = useState<string | null>(from && avalonNames.includes(from) ? from : null);
  const [originQ, setOriginQ] = useState(origin ?? "");
```

Debajo del buscador principal (antes de `{zone && …}`):

```tsx
      <div className="mt-3">
        <ZoneSuggest
          value={originQ}
          onChange={(v) => { setOriginQ(v); if (origin && v !== origin) setOrigin(null); }}
          onPick={(n) => { setOrigin(n); setOriginQ(n); }}
          names={avalonNames}
          placeholder={t("exits.sell.origin")}
          name="from"
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>
```

(Si `ZoneSuggest` no acepta `className` para el input, pásalo como hoy lo hace `ZoneBrowser`: mira su llamada y copia la forma.)

`ExitResult` recibe `origin: string | null` y, en la rama con `city`, añade tras la tarjeta de la ciudad (dentro del `div.grid`):

```tsx
      {origin && city && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:col-span-2" data-testid="where-to-sell">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("exits.sell.title")} · {origin}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("exits.sell.hint")}</p>
          <div className="mt-3"><ZonePrices slug={origin.toLowerCase()} lang={lang} initial={null} nearestCity={city.name} /></div>
        </section>
      )}
```

Run: `npx tsc --noEmit -p . && npm run lint` — Expected: limpio. En `next dev`: `/exits?from=Casitos-Atinaum` trae el origen relleno; escribe «Battlebrae», elige «Battlebrae Lake» → aparece «Where to sell · Casitos-Atinaum» con la columna «Nearest: <ciudad>». Sin `from`, el bloque no aparece hasta elegir origen. `/es/exits` en castellano.

- [ ] **Step 3: Commit**

```bash
git add src/components/zones/ExitFinder.tsx src/components/zones/pages.tsx src/app/exits/page.tsx src/app/es/exits/page.tsx
git commit -m "salidas: «dónde vender» — zona de origen (?from=) y precios en la ciudad más cercana frente a la que mejor paga"
```

### Task 7: Humo sobre el build de producción, suite completa, vault y hub

**Files:**
- Create (scratchpad, fuera del repo): `shot/smoke-fase2.mjs`
- Modify: vault `/root/projects/content-vault/Avalon Tracker/` (nota fechada), hub (`python3 /root/projects/crintech-hub/build.py`)

- [ ] **Step 1: Suite completa y tipos**

Run: `npx vitest run 2>&1 | tail -5 && npx tsc --noEmit -p . && npm run lint` — Expected: todos los tests en verde (101 de la fase 1 + los nuevos), tsc y lint limpios. Cualquier rojo se arregla antes de seguir (nunca se salta).

- [ ] **Step 2: Build de producción local con precios reales**

```bash
export DATABASE_URL="postgresql://postgres@127.0.0.1:54329/postgres?sslmode=disable"   # PGlite: `npx tsx tests/db/pglite-server.ts 54329` (ya arrancado en esta sesión)
npx prisma db push --accept-data-loss
npx tsx scripts/refresh-prices.ts            # 3 peticiones reales a AODP (una por servidor), con User-Agent identificativo
AODP_DISABLED=1 npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
PORT=3200 HOSTNAME=127.0.0.1 AUTH_SECRET=smoke-secret-0123456789abcdef0123456789 AUTH_URL=http://localhost:3200 AODP_DISABLED=1 node .next/standalone/server.js > /tmp/claude-0/-root/39bbbd6f-7554-58e2-a8b8-56319ae26d72/scratchpad/smoke2.log 2>&1 &
```

Expected: `refresh-prices` imprime `europe: N filas` con N > 0 para los tres servidores (si un servidor falla, se anota y se sigue: el humo comprueba el aviso «no prices yet» en ese caso); `curl -s localhost:3200/api/health` responde.

- [ ] **Step 3: `shot/smoke-fase2.mjs`**

```js
// Humo de la fase 2 contra el build de producción local (plan fase 2, Tarea 7).
import { chromium } from "playwright";

const B = process.env.SMOKE_BASE ?? "http://localhost:3200";
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "✓" : "✗", name, detail]); if (!cond) process.exitCode = 1; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, locale: "en-US" });
const P = await ctx.newPage();

// 1) ficha EN: bichos, botín, precios
const r1 = await P.goto(`${B}/zones/casitos-atinaum`, { waitUntil: "networkidle" });
ok("1 ficha 200", r1.status() === 200);
ok("1a bichos", (await P.locator("[data-testid=zone-mobs] li").count()) > 0);
ok("1b botín con Equipment", (await P.locator("[data-testid=zone-loot]").innerText()).includes("Equipment"));
const rows = await P.locator("[data-testid=price-line]").count();
ok("1c líneas de precio (Fiber T7/T6/T5, Hide T6/T5)", rows === 5, String(rows));
const foot = await P.locator("[data-testid=zone-prices] p").last().innerText();
ok("1d pie con fecha de descarga o aviso honesto", /last download \d+ \w+ \d\d:\d\d UTC|No prices downloaded yet/.test(foot), foot);
await P.screenshot({ path: "shot/fase2-ficha.png", fullPage: true });

// 2) servidor y encantamiento
await P.click("button:has-text('Americas')"); await P.waitForResponse((r) => r.url().includes("/prices?server=west")); await P.waitForTimeout(300);
ok("2 servidor west recordado", (await P.getAttribute("[data-testid=zone-prices]", "data-server")) === "west" && (await P.evaluate(() => localStorage.getItem("at.server"))) === "west");
await P.reload({ waitUntil: "networkidle" }); await P.waitForTimeout(500);
ok("2a tras recargar sigue en Americas", (await P.getAttribute("button:has-text('Americas')", "aria-pressed")) === "true");
await P.click("button:has-text('.1')"); await P.waitForResponse((r) => r.url().includes("enchant=1")); await P.waitForTimeout(300);
ok("2b encantamiento .1 en la primera fila", (await P.locator("[data-testid=price-line]").first().innerText()).includes("T7.1"));
await P.evaluate(() => localStorage.removeItem("at.server"));

// 3) ficha ES
await P.goto(`${B}/es/zones/casitos-atinaum`, { waitUntil: "networkidle" });
const es = await P.locator("body").innerText();
ok("3 ES: Bichos + Qué puede salir de los cofres + Precios", es.includes("Bichos") && es.includes("Qué puede salir de los cofres") && es.includes("Precios de lo que se recolecta"));

// 4) API pública
const idx = await P.request.get(`${B}/api/v1/zones`);
const etag = idx.headers()["etag"];
ok("4 índice 200 + CORS + ETag", idx.status() === 200 && idx.headers()["access-control-allow-origin"] === "*" && Boolean(etag) && (await idx.json()).zones.length === 400);
ok("4a If-None-Match → 304", (await P.request.get(`${B}/api/v1/zones`, { headers: { "if-none-match": etag } })).status() === 304);
const det = await (await P.request.get(`${B}/api/v1/zones/Casitos-Atinaum`)).json();
ok("4b ficha API con bichos y botín", det.mobs.length > 0 && det.chests.every((c) => Array.isArray(c.loot)));
const pr = await P.request.get(`${B}/api/v1/zones/casitos-atinaum/prices?server=europe&enchant=0`);
ok("4c precios 200 con 5 líneas", pr.status() === 200 && (await pr.json()).lines.length === 5);
ok("4d zona inexistente → 404", (await P.request.get(`${B}/api/v1/zones/nope`)).status() === 404);
ok("4e servidor inválido → 400", (await P.request.get(`${B}/api/v1/zones/casitos-atinaum/prices?server=mars`)).status() === 400);

// 5) /exits con origen
await P.goto(`${B}/exits?from=Casitos-Atinaum`, { waitUntil: "networkidle" });
ok("5 origen relleno", (await P.inputValue("input[name=from]")) === "Casitos-Atinaum");
await P.fill("input[type=search] >> nth=0", "Battlebrae"); await P.waitForTimeout(300); await P.click("li >> text=Battlebrae Lake");
await P.waitForSelector("[data-testid=where-to-sell]"); await P.waitForTimeout(800);
const sell = await P.locator("[data-testid=where-to-sell]").innerText();
ok("5a dónde vender con columna «Nearest:»", sell.includes("Where to sell") && /Nearest: [A-Z]/.test(sell), sell.split("\n")[0]);
await P.screenshot({ path: "shot/fase2-exits.png", fullPage: true });

// 6) lo de antes sigue: 404 real
ok("6 /zones/nope → 404", (await P.goto(`${B}/zones/nope`)).status() === 404);

await b.close();
for (const [s, n, d] of results) console.log(`${s} ${n}${d ? ` — ${d}` : ""}`);
console.log(`${results.filter((r) => r[0] === "✓").length}/${results.length} OK`);
```

Run: `cd <scratchpad>/shot && node smoke-fase2.mjs` — Expected: `16/16 OK`. Abre `fase2-ficha.png` y `fase2-exits.png` con Read y **míralas** (tabla legible en ancho de escritorio; nada superpuesto; textos en el idioma correcto).

- [ ] **Step 4: Apagar el servidor local, vault y hub**

Mata el proceso de `server.js` por PID (`ss -ltnp | grep 3200`, nunca `pkill -f` con el patrón en el propio comando). Escribe en el vault `/root/projects/content-vault/Avalon Tracker/2026MMDD Avalon Tracker — fase 2 implementada (bichos, botín, precios AODP, API pública).md` (fecha con `date`): qué hay, decisiones (tier real del cofre, tres servidores, Brecilien, BOSS incluido), resultado del humo, pendientes (PR a AODP, TUNNEL_* contra la wiki, huella de Play). Copia `smoke-fase2.mjs` al vault como `.mjs.txt`. Ejecuta `python3 /root/projects/crintech-hub/build.py`.

- [ ] **Step 5: Commit final de la fase (sin desplegar)**

```bash
git status --short   # solo debe quedar limpio o con la nota del vault (que vive fuera del repo)
git log --oneline a231da8..HEAD
```

Expected: 7 commits de la fase 2 sobre `main` (a231da8 = fase 1 en vivo). **No se despliega**: se avisa a Crinlorite con el resumen y se espera su OK para `POST /api/v1/deploy`.

### Task 8: Lista de proyectos de AODP (acción externa: SOLO con OK de Crinlorite)

**Files:** ninguno del repo; PR en `ao-data/albiondata-server-rails`.

- [ ] **Step 1: Ver el formato de la PR #100 (Royal Forge) sin tocar nada**

Run: `gh pr view 100 -R ao-data/albiondata-server-rails --json title,body,files -q '.title, .body, (.files[].path)'` — Expected: la lista de ficheros que tocó (la página de proyectos) y el texto del cuerpo.

- [ ] **Step 2: Redactar la entrada y PARAR**

Entrada propuesta (misma forma que la de Royal Forge; en inglés, que es el idioma de esa lista): nombre «Avalon Tracker», URL `https://avalontracker.app`, descripción «Roads of Avalon zone lookup and route tracker; shows AODP prices for the resources of each Avalon zone and where to sell them», autor Crinlorite. Enséñasela a Crinlorite junto con el fichero exacto que hay que editar y el texto del cuerpo de la PR. **No se hace fork, ni rama, ni PR sin su OK explícito en esta conversación.**

- [ ] **Step 3 (solo tras el OK): fork, rama, commit y PR**

```bash
gh repo fork ao-data/albiondata-server-rails --clone=true --remote=false -- /tmp/claude-0/-root/39bbbd6f-7554-58e2-a8b8-56319ae26d72/scratchpad/aodp-rails
cd /tmp/claude-0/-root/39bbbd6f-7554-58e2-a8b8-56319ae26d72/scratchpad/aodp-rails && git checkout -b avalon-tracker
# editar el fichero que enseñó el paso 1, en la posición alfabética que corresponda
git -c user.name=Crinlorite -c user.email=xlorit@hotmail.es commit -am "Add Avalon Tracker to the projects list"
git push -u origin avalon-tracker
gh pr create -R ao-data/albiondata-server-rails --title "Add Avalon Tracker to the projects list" --body "<cuerpo aprobado>"
```

Expected: URL de la PR; anótala en el vault y en la memoria del proyecto.

---

## Fuera de este plan (quedan en el spec §14 y en la nota del vault)

- Significado exacto de las clases `TUNNEL_*` contra la wiki (spec §14.1): la ficha sigue enseñando el código crudo junto a la etiqueta.
- Orientación del minimapa (spec §14.3).
- Huella SHA-256 de Play para `ANDROID_SIGNING_SHA256` (fase 1, pendiente de Crinlorite).
- Menores aplazados de la revisión de la fase 1 (nota del vault «fase 1 EN VIVO»).
- Propuesta a la sesión de Royal Forge: «zonas de Avalon donde se recolecta este recurso» enlazando a `/zones/<zona>` (spec §7); se le manda cuando la fase esté en vivo.
