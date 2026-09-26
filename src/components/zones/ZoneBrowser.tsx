"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ZoneSuggest } from "./ZoneSuggest";
import type { ZoneSummary, ZoneFamily, ResourceType, ChestType, DungeonType } from "@/lib/avalon-zones";
import { publicT, publicPath, type PublicLang, type PublicKey } from "@/i18n/public";
import { RESOURCE_COLOR, CHEST_COLOR, DUNGEON_COLOR } from "./ZoneMiniMap";

const TIERS = [4, 6, 8];
const RESOURCES: ResourceType[] = ["ORE", "WOOD", "FIBER", "HIDE", "STONE"];
const CHESTS: ChestType[] = ["GOLD", "BLUE", "GREEN"];
const DUNGEONS: DungeonType[] = ["DUNGEON_ELITE", "DUNGEON_GROUP", "DUNGEON_SOLO"];
const FAMILIES: ZoneFamily[] = ["royal", "outlands", "hideout", "deep", "standard"];

type Filters = { q: string; tier: string; res: string; chest: string; dng: string; fam: string; ho: boolean };
const EMPTY: Filters = { q: "", tier: "", res: "", chest: "", dng: "", fam: "", ho: false };

// Normaliza para buscar sin importar guiones, mayúsculas o espacios.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function ZoneBrowser({ zones, lang }: { zones: ZoneSummary[]; lang: PublicLang }) {
  const t = publicT(lang);
  // Los filtros viven en la URL (?q=&tier=…) para poder compartirlos; el
  // servidor ya pinta la lista filtrada.
  const sp = useSearchParams();
  const router = useRouter();
  const names = useMemo(() => zones.map((z) => z.n), [zones]);
  const [f, setF] = useState<Filters>(() => ({
    ...EMPTY,
    q: sp.get("q") ?? "", tier: sp.get("tier") ?? "", res: sp.get("res") ?? "", chest: sp.get("chest") ?? "",
    dng: sp.get("dng") ?? "", fam: sp.get("fam") ?? "", ho: sp.get("ho") === "1",
  }));
  useEffect(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v === true ? "1" : String(v));
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [f]);

  const list = useMemo(() => {
    const q = norm(f.q);
    return zones.filter((z) =>
      (!q || norm(z.n).includes(q)) &&
      (!f.tier || z.t === Number(f.tier)) &&
      (!f.res || z.r.includes(f.res as ResourceType)) &&
      (!f.chest || z.c[f.chest as ChestType] > 0) &&
      (!f.dng || z.d[f.dng as DungeonType] > 0) &&
      (!f.fam || z.f === f.fam) &&
      (!f.ho || z.h),
    ).sort((a, b) => {
      // Con búsqueda, primero las que empiezan por el texto.
      if (q) {
        const sa = norm(a.n).startsWith(q) ? 0 : 1;
        const sb = norm(b.n).startsWith(q) ? 0 : 1;
        if (sa !== sb) return sa - sb;
      }
      return a.n.localeCompare(b.n);
    });
  }, [zones, f]);

  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));
  const select = "rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200";

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <ZoneSuggest
          value={f.q}
          onChange={(q) => set({ q })}
          onPick={(zone) => router.push(publicPath(lang, `/zones/${zone.toLowerCase()}`))}
          names={names}
          placeholder={t("zones.search")}
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">{t("zones.filter.tier")}
            <select className={select} value={f.tier} onChange={(e) => set({ tier: e.target.value })}>
              <option value="">{t("zones.filter.any")}</option>
              {TIERS.map((x) => <option key={x} value={x}>T{x}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">{t("zones.filter.resource")}
            <select className={select} value={f.res} onChange={(e) => set({ res: e.target.value })}>
              <option value="">{t("zones.filter.any")}</option>
              {RESOURCES.map((x) => <option key={x} value={x}>{t(`res.${x}` as PublicKey)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">{t("zones.filter.chest")}
            <select className={select} value={f.chest} onChange={(e) => set({ chest: e.target.value })}>
              <option value="">{t("zones.filter.any")}</option>
              {CHESTS.map((x) => <option key={x} value={x}>{t(`chest.${x}` as PublicKey)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">{t("zones.filter.dungeon")}
            <select className={select} value={f.dng} onChange={(e) => set({ dng: e.target.value })}>
              <option value="">{t("zones.filter.any")}</option>
              {DUNGEONS.map((x) => <option key={x} value={x}>{t(`dng.${x}` as PublicKey)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">{t("zones.filter.class")}
            <select className={select} value={f.fam} onChange={(e) => set({ fam: e.target.value })}>
              <option value="">{t("zones.filter.any")}</option>
              {FAMILIES.map((x) => <option key={x} value={x}>{t(`family.${x}` as PublicKey)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={f.ho} onChange={(e) => set({ ho: e.target.checked })} className="accent-indigo-500" />
            {t("zones.filter.hideout")}
          </label>
          <span className="ml-auto text-xs text-slate-500">{t("zones.results", { n: list.length })}</span>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{t("zones.none")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-800/80 rounded-xl border border-slate-800">
          {list.map((z) => (
            <li key={z.s}>
              <Link href={publicPath(lang, `/zones/${z.s}`)} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-slate-900/70">
                <span className="w-10 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-center text-xs font-semibold text-slate-200">T{z.t}</span>
                <span className="min-w-[11rem] flex-1 font-medium text-white">{z.n}</span>
                <span className="flex items-center gap-1" aria-label={t("zones.col.resources")}>
                  {z.r.map((r) => (
                    <span key={r} title={t(`res.${r}` as PublicKey)} className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESOURCE_COLOR[r] }} />
                  ))}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-400" aria-label={t("zones.col.chests")}>
                  {CHESTS.filter((c) => z.c[c] > 0).map((c) => (
                    <span key={c} className="flex items-center gap-1" title={t(`chest.${c}` as PublicKey)}>
                      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: CHEST_COLOR[c] }} />{z.c[c]}
                    </span>
                  ))}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-400" aria-label={t("zones.col.dungeons")}>
                  {DUNGEONS.filter((d) => z.d[d] > 0).map((d) => (
                    <span key={d} className="flex items-center gap-1" title={t(`dng.${d}` as PublicKey)}>
                      <span className="inline-block h-2.5 w-2.5 rotate-45" style={{ backgroundColor: DUNGEON_COLOR[d] }} />{t(`dng.short.${d}` as PublicKey)}
                    </span>
                  ))}
                </span>
                {z.h && <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">HO</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
