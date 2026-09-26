/**
 * Extrae las zonas de los Caminos de Avalon del dump público del juego
 * (https://github.com/ao-data/ao-bin-dumps) y genera:
 *
 *   src/data/avalon-zones.json         — una entrada por zona (lo consume
 *                                        el seed, la parte pública y la app)
 *   src/data/avalon-zones.source.json  — commit exacto del dump y fecha
 *   src/data/avalon-zone-names.json    — solo los nombres (middleware)
 *
 * De dónde sale cada dato:
 *   - nombre, id, clase (`@type`) y distribución de nodos por tier:
 *     cluster/world.json
 *   - tier: el nombre del fichero del cluster (`..._T6_AVA_AVA.cluster.xml`)
 *   - recursos, mazmorras y cofres: las plantillas que instancia cada
 *     cluster. Cada instancia activa unas capas; dentro de las capas activas
 *     están los marcadores del minimapa (recursos/mazmorras) y los puntos de
 *     aparición de cofres. El tamaño sale del prefijo de la plantilla
 *     (`S_` pequeño, `M_` grande) o del nombre del cofre (SMALL / MEDIUM).
 *   - posiciones (para el minimapa): posición de la instancia + posición de
 *     la pieza girada `rot` grados. Verificado contra los marcadores que
 *     trae world.json.
 *
 * Uso:
 *   npx tsx scripts/extract-avalon-zones.ts            # último commit del dump
 *   npx tsx scripts/extract-avalon-zones.ts --sha <c>  # commit concreto
 *
 * Las descargas se cachean en .cache/ao-bin-dumps/<sha>/ (fuera de git).
 * No toca la BD: después hay que desplegar para que `seed-zones` sincronice.
 */
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { RENAMED_ZONES } from "./zone-renames";

const REPO = "ao-data/ao-bin-dumps";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/data/avalon-zones.json");
const OUT_SOURCE = path.join(ROOT, "src/data/avalon-zones.source.json");
// Lista ligera de nombres para el middleware (404 de zonas inexistentes).
const OUT_NAMES = path.join(ROOT, "src/data/avalon-zone-names.json");


type Size = "small" | "large";
type Counted<T extends string> = { type: T; size: Size; count: number };
type ResourceType = "ORE" | "WOOD" | "FIBER" | "HIDE" | "STONE";
type ChestType = "GREEN" | "BLUE" | "GOLD";
type DungeonType = "DUNGEON_SOLO" | "DUNGEON_GROUP" | "DUNGEON_ELITE";
type MarkerKind = "resource" | "chest" | "dungeon";

export type AvalonZoneOut = {
  name: string;
  clusterId: string;
  type: "AVALON";
  tier: number;
  zoneClass: string;
  hasHideout: boolean;
  resources: Counted<ResourceType>[];
  chests: Counted<ChestType>[];
  dungeons: Counted<DungeonType>[];
  nodes: { type: ResourceType; tier: number; count: number }[];
  map: {
    min: [number, number];
    max: [number, number];
    markers: { kind: MarkerKind; type: string; size: Size; x: number; y: number }[];
  };
};

const RESOURCE_BY_MARKER: Record<string, ResourceType> = {
  Ore: "ORE", Wood: "WOOD", Fiber: "FIBER", Hide: "HIDE", Stone: "STONE",
};
const DUNGEON_BY_MARKER: Record<string, DungeonType> = {
  dungeon_solo: "DUNGEON_SOLO", dungeon_group: "DUNGEON_GROUP", dungeon_elite: "DUNGEON_ELITE",
};
const RESOURCE_BY_DIST: Record<string, ResourceType> = {
  ORE: "ORE", WOOD: "WOOD", FIBER: "FIBER", HIDE: "HIDE", ROCK: "STONE",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => ["templateinstance", "activelayer", "layergroup", "layer", "tile", "minimapmarker"].includes(name),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function latestSha(): Promise<string> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/commits/master`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "avalon-tracker-extract" },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return ((await r.json()) as { sha: string }).sha;
}

async function listTemplates(sha: string): Promise<Map<string, string[]>> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${sha}?recursive=1`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "avalon-tracker-extract" },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const tree = ((await r.json()) as { tree: { path: string }[] }).tree;
  const idx = new Map<string, string[]>();
  for (const { path: p } of tree) {
    const m = /^templates\/([^/]+)\/(.+)\.template\.xml$/.exec(p);
    if (!m) continue;
    const list = idx.get(m[2]) ?? [];
    list.push(p);
    idx.set(m[2], list);
  }
  return idx;
}

async function cached(sha: string, file: string): Promise<string> {
  const local = path.join(ROOT, ".cache/ao-bin-dumps", sha, file);
  if (fs.existsSync(local)) return fs.readFileSync(local, "utf8");
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${file}`);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  const text = await r.text();
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, text);
  return text;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const xy = (s: string | undefined): [number, number] => {
  const p = (s ?? "0 0 0").trim().split(/\s+/).map(Number);
  // Posiciones 3D "x y z" → plano (x, z). Las 2D "x y" ya vienen en plano.
  return p.length >= 3 ? [p[0], p[2]] : [p[0], p[1]];
};

// Giro de una pieza dentro de su instancia. Convención verificada contra
// world.json (Cases-Ugumlos: entrada de mazmorra de grupo con rot=270).
function place(inst: [number, number], rotDeg: number, local: [number, number]): [number, number] {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e6) / 1e6;
  const s = Math.round(Math.sin(r) * 1e6) / 1e6;
  const [tx, tz] = local;
  return [Math.round(inst[0] + tx * c + tz * s), Math.round(inst[1] - tx * s + tz * c)];
}

type Tile = { name?: string; pos?: string; minimapmarker?: { type: string }[] };
type Layer = { id: string; activationRule?: string; tile?: Tile[] };
type TemplateDoc = { template: { tiles: { tile?: Tile[]; layergroup?: { layer?: Layer[] }[] } } };

function activeTiles(doc: TemplateDoc, active: Set<string>, tier: number): Tile[] {
  const tiles = doc.template.tiles;
  const out: Tile[] = [...(tiles.tile ?? [])];
  for (const g of tiles.layergroup ?? []) {
    for (const l of g.layer ?? []) {
      const byRule = l.activationRule?.includes(`_T${tier}_`) ?? false;
      if (active.has(l.id) || byRule) out.push(...(l.tile ?? []));
    }
  }
  return out;
}

function chestOf(name: string): { type: ChestType; size: Size } | null {
  const m = /^SpawnPoint_LOOTCHEST_(SMALL|MEDIUM)_AVALON_ROAD_(?:(VETERAN|ELITE)_)?T\d$/.exec(name);
  if (!m) return null;
  const type: ChestType = m[2] === "ELITE" ? "GOLD" : m[2] === "VETERAN" ? "BLUE" : "GREEN";
  return { type, size: m[1] === "SMALL" ? "small" : "large" };
}

function tally<T extends string>(items: { type: T; size: Size }[]): Counted<T>[] {
  const m = new Map<string, Counted<T>>();
  for (const it of items) {
    const k = `${it.type}|${it.size}`;
    const e = m.get(k);
    if (e) e.count++;
    else m.set(k, { type: it.type, size: it.size, count: 1 });
  }
  return [...m.values()].sort((a, b) => a.type.localeCompare(b.type) || a.size.localeCompare(b.size));
}

async function main() {
  const sha = arg("sha") ?? (await latestSha());
  console.log(`[extract] dump ${REPO}@${sha.slice(0, 10)}`);

  const worldJson = JSON.parse(await cached(sha, "cluster/world.json")) as {
    world: { clusters: { cluster: Record<string, unknown>[] } };
  };
  const roads = worldJson.world.clusters.cluster.filter((c) => String(c["@file"]).includes("_RDS_"));
  console.log(`[extract] ${roads.length} zonas de Avalon en world.json`);

  const templatesIdx = await listTemplates(sha);
  const templateCache = new Map<string, TemplateDoc>();
  async function template(ref: string): Promise<TemplateDoc> {
    const hit = templateCache.get(ref);
    if (hit) return hit;
    const paths = templatesIdx.get(ref);
    if (!paths?.length) throw new Error(`plantilla ${ref} no encontrada en el dump`);
    // Algunas plantillas existen en varias carpetas (NONE, RED…). Para
    // cofres y marcadores son idénticas (comprobado); se prefiere NONE.
    const p = paths.find((x) => x.startsWith("templates/NONE/")) ?? paths[0];
    const doc = parser.parse(await cached(sha, p)) as TemplateDoc;
    templateCache.set(ref, doc);
    return doc;
  }

  const zones = await pool(roads, 8, async (c): Promise<AvalonZoneOut> => {
    const file = String(c["@file"]);
    const name = String(c["@displayname"]);
    const tierMatch = /_T(\d)_/.exec(file);
    if (!tierMatch) throw new Error(`sin tier en ${file}`);
    const tier = Number(tierMatch[1]);
    const zoneClass = String(c["@type"]);

    const cluster = parser.parse(await cached(sha, `cluster/${file}`)) as {
      cluster: { templateinstance?: { ref: string; pos?: string; rot?: string; activelayer?: { id: string }[] }[] };
    };

    const markers: AvalonZoneOut["map"]["markers"] = [];
    let hideoutTemplate = false;
    for (const inst of cluster.cluster.templateinstance ?? []) {
      if (/HIDEOUT/i.test(inst.ref)) hideoutTemplate = true;
      const doc = await template(inst.ref);
      const active = new Set((inst.activelayer ?? []).map((a) => a.id));
      const size: Size = inst.ref.startsWith("M_") ? "large" : "small";
      const origin = xy(inst.pos);
      const rot = Number(inst.rot ?? 0);
      for (const t of activeTiles(doc, active, tier)) {
        const [x, y] = place(origin, rot, xy(t.pos));
        for (const mm of t.minimapmarker ?? []) {
          const res = RESOURCE_BY_MARKER[mm.type];
          const dng = DUNGEON_BY_MARKER[mm.type];
          if (res) markers.push({ kind: "resource", type: res, size, x, y });
          else if (dng) markers.push({ kind: "dungeon", type: dng, size, x, y });
        }
        const chest = t.name ? chestOf(t.name) : null;
        if (chest) markers.push({ kind: "chest", type: chest.type, size: chest.size, x, y });
      }
    }

    // Comprobación cruzada: los marcadores de recursos/mazmorras que
    // calculamos deben coincidir con los que world.json trae ya colocados.
    const official = ((c["minimapmarkers"] as { marker?: unknown } | null)?.marker ?? []) as { "@type": string; "@pos": string }[];
    const officialList = Array.isArray(official) ? official : [official];
    const ours = markers.filter((m) => m.kind !== "chest").map((m) => `${m.x},${m.y}`).sort();
    const theirs = officialList.map((m) => xy(m["@pos"]).map(Math.round).join(",")).sort();
    if (ours.join("|") !== theirs.join("|")) {
      throw new Error(`${name}: marcadores no cuadran con world.json\n  nuestros ${ours}\n  oficiales ${theirs}`);
    }

    const dist = ((c["distribution"] as { resource?: unknown } | null)?.resource ?? []) as { "@name": string; "@tier": string; "@count": string }[];
    const nodes = (Array.isArray(dist) ? dist : [dist])
      .filter((r) => RESOURCE_BY_DIST[r["@name"]])
      .map((r) => ({ type: RESOURCE_BY_DIST[r["@name"]], tier: Number(r["@tier"]), count: Number(r["@count"]) }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.tier - b.tier);

    return {
      name,
      clusterId: String(c["@id"]),
      type: "AVALON",
      tier,
      zoneClass,
      hasHideout: zoneClass.startsWith("TUNNEL_HIDEOUT") || hideoutTemplate,
      resources: tally(markers.filter((m) => m.kind === "resource") as { type: ResourceType; size: Size }[]),
      chests: tally(markers.filter((m) => m.kind === "chest") as { type: ChestType; size: Size }[]),
      dungeons: tally(markers.filter((m) => m.kind === "dungeon") as { type: DungeonType; size: Size }[]),
      nodes,
      map: {
        min: xy(String(c["@minimapBoundsMin"])),
        max: xy(String(c["@minimapBoundsMax"])),
        markers,
      },
    };
  });

  zones.sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set(zones.map((z) => z.name));
  if (names.size !== zones.length) throw new Error("nombres de zona duplicados en el dump");

  // Informe frente al fichero anterior.
  if (fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8")) as { name: string; tier?: number }[];
    const prevNames = new Set(prev.map((z) => RENAMED_ZONES[z.name] ?? z.name));
    const added = zones.filter((z) => !prevNames.has(z.name)).length;
    const gone = [...prevNames].filter((n) => !names.has(n));
    const tierChanged = prev.filter((p) => {
      const z = zones.find((x) => x.name === (RENAMED_ZONES[p.name] ?? p.name));
      return z && p.tier !== z.tier;
    }).length;
    console.log(`[extract] frente al anterior: +${added} nuevas, ${gone.length} desaparecidas, ${tierChanged} con tier distinto`);
    if (gone.length) console.log(`[extract]   desaparecidas: ${gone.join(", ")}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(zones, null, 1) + "\n");
  fs.writeFileSync(OUT_NAMES, JSON.stringify(zones.map((z) => z.name)) + "\n");
  fs.writeFileSync(OUT_SOURCE, JSON.stringify({
    source: `https://github.com/${REPO}`,
    commit: sha,
    generatedAt: new Date().toISOString(),
    zones: zones.length,
    note: "Game data extracted by the community from Albion Online's client files (© Sandbox Interactive). Regenerate with scripts/extract-avalon-zones.ts.",
  }, null, 2) + "\n");
  console.log(`[extract] ${zones.length} zonas → ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1]?.endsWith("extract-avalon-zones.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
