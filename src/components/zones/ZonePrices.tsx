"use client";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
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

// Servidor recordado en este navegador, leído como almacén externo: en el
// servidor no hay nada (coincide con el HTML) y tras hidratar React lo aplica.
const subscribeStorage = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
const readStored = (): GameServer | null => {
  try { const s = localStorage.getItem(STORAGE); return s && (GAME_SERVERS as string[]).includes(s) ? (s as GameServer) : null; } catch { return null; }
};

// Precios de los recursos de una zona: servidor (recordado en el navegador)
// y encantamiento. Con `initial` pinta sin esperar; cualquier cambio pide
// /api/v1/zones/<slug>/prices (caché de AODP; nunca AODP en directo).
export function ZonePrices({ slug, lang, initial, nearestCity }: { slug: string; lang: PublicLang; initial: PricesPayload | null; nearestCity?: string }) {
  const t = publicT(lang);
  const stored = useSyncExternalStore(subscribeStorage, readStored, () => null);
  const [picked, setPicked] = useState<GameServer | null>(null);
  const server: GameServer = picked ?? stored ?? initial?.server ?? DEFAULT_SERVER;
  const [enchant, setEnchant] = useState<Enchant>(initial?.enchant ?? 0);
  const [data, setData] = useState<PricesPayload | null>(initial);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const nf = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US");

  const reqKey = `${slug.toLowerCase()}|${server}|${enchant}`;
  const fresh = !!data && data.zone.toLowerCase() === slug.toLowerCase() && data.server === server && data.enchant === enchant;
  const failed = failedKey === reqKey;
  const loading = !fresh && !failed;

  useEffect(() => {
    if (fresh || failed) return;
    const ctrl = new AbortController();
    fetch(`/api/v1/zones/${encodeURIComponent(slug)}/prices?server=${server}&enchant=${enchant}`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<PricesPayload>; })
      .then((j) => setData(j))
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setFailedKey(reqKey); });
    return () => ctrl.abort();
  }, [slug, server, enchant, fresh, failed, reqKey]);

  const pick = (s: GameServer) => { setPicked(s); try { localStorage.setItem(STORAGE, s); } catch { /* sin almacenamiento */ } };
  const lines = data?.lines ?? [];
  const cols = nearestCity ? 5 : 4;
  const num = (v: number | null | undefined) => (v == null ? <span className="text-slate-500">{t("prices.nodata")}</span> : nf.format(v));

  return (
    <div data-testid="zone-prices" data-server={server}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Choice label={t("prices.server")} value={server} options={GAME_SERVERS.map((s) => [s, t(`prices.server.${s}` as PublicKey)])} onChange={(v) => pick(v as GameServer)} />
        <Choice label={t("prices.enchant")} value={String(enchant)} options={ENCHANTS.map((e) => [String(e), `.${e}`])} onChange={(v) => setEnchant(Number(v) as Enchant)} />
      </div>
      {failed && <p className="mt-3 text-sm text-amber-300">{t("prices.error")}</p>}
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
            <tbody className={loading ? "opacity-50" : undefined}>
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
        {data?.fetchedAt ? t("prices.updated", { when: whenUtc(data.fetchedAt, lang) }) : data ? t("prices.empty") : failed ? "" : t("prices.loading")} {t("prices.note")}
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
