import type { AvalonZone } from "@/lib/avalon-zones";
import type { PublicT, PublicKey } from "@/i18n/public";

// Minimapa esquemático de una zona de Avalon: posiciones reales (del
// dump) de nodos de recursos, cofres y entradas de mazmorra. SVG de
// servidor, sin JS. La orientación es la del plano del juego (x, z) sin
// girar: pendiente de contrastar con el minimapa del juego.

export const RESOURCE_COLOR: Record<string, string> = {
  ORE: "#94a3b8",
  WOOD: "#b45309",
  FIBER: "#84cc16",
  HIDE: "#f97316",
  STONE: "#e2e8f0",
};
export const CHEST_COLOR: Record<string, string> = {
  GOLD: "#facc15",
  BLUE: "#3b82f6",
  GREEN: "#22c55e",
};
export const DUNGEON_COLOR: Record<string, string> = {
  DUNGEON_SOLO: "#a855f7",
  DUNGEON_GROUP: "#ef4444",
  DUNGEON_ELITE: "#f59e0b",
};

export function ZoneMiniMap({ zone, t }: { zone: AvalonZone; t: PublicT }) {
  const [minX, minY] = zone.map.min;
  const [maxX, maxY] = zone.map.max;
  const pad = 30;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const unit = Math.max(w, h) / 60;

  const label = (m: AvalonZone["map"]["markers"][number]) => {
    const key = (m.kind === "resource" ? `res.${m.type}` : m.kind === "chest" ? `chest.${m.type}` : `dng.${m.type}`) as PublicKey;
    return `${t(key)} (${t(`size.${m.size}` as PublicKey)})`;
  };

  // Primero recursos, luego mazmorras, cofres encima.
  const order = { resource: 0, dungeon: 1, chest: 2 } as const;
  const markers = [...zone.map.markers].sort((a, b) => order[a.kind] - order[b.kind]);

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${w} ${h}`}
      role="img"
      aria-label={t("zone.map")}
      className="h-auto w-full rounded-xl border border-slate-800 bg-slate-900"
    >
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx={unit * 2} fill="#0f172a" stroke="#1e293b" strokeWidth={unit / 3} />
      {markers.map((m, i) => {
        const big = m.size === "large";
        if (m.kind === "resource") {
          const r = unit * (big ? 1.9 : 1.3);
          return (
            <circle key={i} cx={m.x} cy={m.y} r={r} fill={RESOURCE_COLOR[m.type]} stroke="#020617" strokeWidth={unit / 3}>
              <title>{label(m)}</title>
            </circle>
          );
        }
        if (m.kind === "chest") {
          const s = unit * (big ? 2.4 : 1.6);
          return (
            <rect key={i} x={m.x - s / 2} y={m.y - s / 2} width={s} height={s} rx={s / 5} fill={CHEST_COLOR[m.type]} stroke="#020617" strokeWidth={unit / 3}>
              <title>{label(m)}</title>
            </rect>
          );
        }
        const s = unit * (big ? 2.8 : 2.2);
        return (
          <path
            key={i}
            d={`M ${m.x} ${m.y - s} L ${m.x + s} ${m.y} L ${m.x} ${m.y + s} L ${m.x - s} ${m.y} Z`}
            fill={DUNGEON_COLOR[m.type]}
            stroke="#020617"
            strokeWidth={unit / 3}
          >
            <title>{label(m)}</title>
          </path>
        );
      })}
    </svg>
  );
}

export function MiniMapLegend({ zone, t }: { zone: AvalonZone; t: PublicT }) {
  const seen = new Map<string, { color: string; shape: "circle" | "square" | "diamond"; text: string }>();
  const rank = (m: AvalonZone["map"]["markers"][number]) =>
    (m.kind === "resource" ? 0 : m.kind === "chest" ? 10 : 20) + ["GOLD", "BLUE", "GREEN", "DUNGEON_ELITE", "DUNGEON_GROUP", "DUNGEON_SOLO"].indexOf(m.type);
  for (const m of [...zone.map.markers].sort((a, b) => rank(a) - rank(b))) {
    const k = `${m.kind}:${m.type}`;
    if (seen.has(k)) continue;
    if (m.kind === "resource") seen.set(k, { color: RESOURCE_COLOR[m.type], shape: "circle", text: t(`res.${m.type}` as PublicKey) });
    else if (m.kind === "chest") seen.set(k, { color: CHEST_COLOR[m.type], shape: "square", text: t(`chest.${m.type}` as PublicKey) });
    else seen.set(k, { color: DUNGEON_COLOR[m.type], shape: "diamond", text: t(`dng.${m.type}` as PublicKey) });
  }
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
      {[...seen.values()].map((e) => (
        <li key={e.text} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-2.5 w-2.5 ${e.shape === "circle" ? "rounded-full" : e.shape === "square" ? "rounded-[2px]" : "rotate-45"}`}
            style={{ backgroundColor: e.color }}
          />
          {e.text}
        </li>
      ))}
    </ul>
  );
}
