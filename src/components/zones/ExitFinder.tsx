"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import meta from "@/data/world-meta.json";
import { nearestRoyalCity, nearestRoyalPortals, getZonePvp, borderColorForPvp } from "@/lib/world-meta";
import { publicT, publicPath, type PublicLang } from "@/i18n/public";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const ROYAL = new Set(["Lymhurst", "Martlock", "Thetford", "Bridgewatch", "Fort Sterling"]);

// Buscador «¿dónde he salido?»: nombre de zona del mundo → ciudad royal y
// portales royal más cercanos (BFS sobre world-meta.json, que conserva las
// correcciones hechas a mano).
export function ExitFinder({ lang, avalonNames }: { lang: PublicLang; avalonNames: string[] }) {
  const t = publicT(lang);
  const avalon = useMemo(() => new Set(avalonNames), [avalonNames]);
  const worldNames = useMemo(
    () => Object.keys((meta as { pvp: Record<string, string> }).pvp).filter((n) => !/^\d+$/.test(n)).sort(),
    [],
  );
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const k = norm(q);
    if (k.length < 2) return [];
    const all = [...worldNames, ...avalonNames.filter((n) => !worldNames.includes(n))];
    return all
      .filter((n) => norm(n).includes(k))
      .sort((a, b) => Number(!norm(a).startsWith(k)) - Number(!norm(b).startsWith(k)) || a.localeCompare(b))
      .slice(0, 8);
  }, [q, worldNames, avalonNames]);

  const zone = picked;
  return (
    <div className="max-w-2xl">
      <div className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) { setPicked(suggestions[0]); setQ(suggestions[0]); } }}
          placeholder={t("exits.search")}
          aria-label={t("exits.search")}
          autoFocus
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        {!picked && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            {suggestions.map((n) => (
              <li key={n}>
                <button type="button" onClick={() => { setPicked(n); setQ(n); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: borderColorForPvp(getZonePvp(n)) }} />
                  {n}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {zone && <ExitResult zone={zone} isAvalon={avalon.has(zone)} lang={lang} />}
    </div>
  );
}

function ExitResult({ zone, isAvalon, lang }: { zone: string; isAvalon: boolean; lang: PublicLang }) {
  const t = publicT(lang);
  if (isAvalon) {
    return (
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300">
        <p>{t("exits.avalon")}</p>
        <Link href={publicPath(lang, `/zones/${zone.toLowerCase()}`)} className="mt-3 inline-block font-semibold text-indigo-300 hover:text-indigo-200">{zone} →</Link>
      </div>
    );
  }
  if (ROYAL.has(zone)) {
    return <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300">{t("exits.here")}</p>;
  }
  const city = nearestRoyalCity(zone);
  const portals = getZonePvp(zone) === "black" ? nearestRoyalPortals(zone, 2) : [];
  if (!city && portals.length === 0) {
    return <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">{t("exits.unknown")}</p>;
  }
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {portals.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("exits.portals")}</h2>
          <ul className="mt-2 space-y-2">
            {portals.map((p) => (
              <li key={p.name}>
                <p className="text-lg font-semibold text-white">{p.name}</p>
                <p className="text-sm text-slate-400">{t("exits.hops", { n: p.hops })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {city && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("exits.city")}</h2>
          <p className="mt-2 text-lg font-semibold text-white">{city.name}</p>
          <p className="text-sm text-slate-400">{t("exits.hops", { n: city.hops })}</p>
        </section>
      )}
    </div>
  );
}
