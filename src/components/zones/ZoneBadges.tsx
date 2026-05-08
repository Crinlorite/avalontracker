import type { ZoneSuggestion } from "@/hooks/useZoneSearch";

export function ZoneBadges({ zone }: { zone: ZoneSuggestion }) {
  const color = zone.type === "AVALON" ? "bg-violet-700" : zone.type === "ROYAL" ? "bg-blue-700" : "bg-red-700";
  return (
    <span className="flex gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${color}`}>{zone.type}</span>
      {zone.tier != null && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white">T{zone.tier}</span>}
      {zone.hasHideout && <span className="rounded bg-yellow-600 px-1.5 py-0.5 text-[10px] text-white">HO</span>}
      {zone.isRest && <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] text-white">Rest</span>}
      {zone.isCapital && <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] text-white">Capital</span>}
    </span>
  );
}
