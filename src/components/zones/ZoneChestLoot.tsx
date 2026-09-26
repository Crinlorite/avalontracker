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
