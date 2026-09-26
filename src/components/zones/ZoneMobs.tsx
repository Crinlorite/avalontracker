import { mobLabel, sortMobs, type ZoneMob } from "@/lib/mobs";
import type { PublicT } from "@/i18n/public";
import { RESOURCE_COLOR } from "./ZoneMiniMap";

// Bichos de la zona (mobcounts del dump): puntos de aparición, no población.
export function ZoneMobs({ mobs, t }: { mobs: ZoneMob[]; t: PublicT }) {
  if (mobs.length === 0) return <p className="text-sm text-slate-400">{t("zone.mobs.none")}</p>;
  return (
    <>
      <ul className="space-y-1.5 text-sm" data-testid="zone-mobs">
        {sortMobs(mobs).map((m) => (
          <li key={mobLabel(m, t)} className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 ${m.kind === "critter" ? "rounded-full" : m.kind === "animal" ? "rounded-full bg-slate-500" : m.kind === "other" ? "rounded-[2px] bg-slate-600" : "rotate-45 bg-amber-400"}`}
              style={m.kind === "critter" ? { backgroundColor: RESOURCE_COLOR[m.resource] } : undefined}
            />
            <span className="text-white">{m.count}× {mobLabel(m, t)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{t("zone.mobs.note")}</p>
    </>
  );
}
