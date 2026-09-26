import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/PublicShell";
import { ZoneBrowser } from "./ZoneBrowser";
import { ZoneMiniMap, MiniMapLegend, RESOURCE_COLOR, CHEST_COLOR, DUNGEON_COLOR } from "./ZoneMiniMap";
import { ExitFinder } from "./ExitFinder";
import {
  AVALON_ZONES, ZONES_SOURCE, zoneBySlug, zoneSlug, zoneSummaries, zoneFamily, similarZones,
  resourceTypes, chestCount, dungeonCount, CHEST_TYPES, DUNGEON_TYPES, type AvalonZone,
} from "@/lib/avalon-zones";
import { publicT, publicPath, type PublicLang, type PublicKey, type PublicT } from "@/i18n/public";

const SITE = "https://avalontracker.app";

function alternates(path: string, lang: PublicLang): Metadata["alternates"] {
  return {
    canonical: publicPath(lang, path),
    languages: { en: path, es: `/es${path}`, "x-default": path },
  };
}

// ——— /zones ———

export function zonesIndexMetadata(lang: PublicLang): Metadata {
  const t = publicT(lang);
  return {
    title: { absolute: t("zones.metaTitle") },
    description: t("zones.metaDesc"),
    alternates: alternates("/zones", lang),
    openGraph: { title: t("zones.metaTitle"), description: t("zones.metaDesc"), url: `${SITE}${publicPath(lang, "/zones")}`, locale: lang === "es" ? "es_ES" : "en_US" },
  };
}

export function ZonesIndexPage({ lang }: { lang: PublicLang }) {
  const t = publicT(lang);
  return (
    <PublicShell lang={lang} altHref={lang === "es" ? "/zones" : "/es/zones"}>
      <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{t("zones.title")}</h1>
      <p className="mt-3 max-w-3xl text-slate-400">{t("zones.intro")}</p>
      <div className="mt-6">
        <ZoneBrowser zones={zoneSummaries()} lang={lang} />
      </div>
      <SourceNote t={t} />
    </PublicShell>
  );
}

// ——— /zones/<zona> ———

export function zoneStaticParams() {
  return AVALON_ZONES.map((z) => ({ zone: zoneSlug(z.name) }));
}

function summaryParts(z: AvalonZone, t: PublicT) {
  const res = resourceTypes(z).map((r) => t(`res.${r}` as PublicKey)).join(", ") || t("summary.resources.none");
  const chests = chestCount(z) ? t("summary.chests", { n: chestCount(z) }) : t("summary.chests.none");
  const dungeons = dungeonCount(z) ? t("summary.dungeons", { n: dungeonCount(z) }) : t("summary.dungeons.none");
  return { res, chests, dungeons };
}

export async function zoneMetadata(params: Promise<{ zone: string }>, lang: PublicLang): Promise<Metadata> {
  const z = zoneBySlug((await params).zone);
  if (!z) return {};
  const t = publicT(lang);
  const { res, chests, dungeons } = summaryParts(z, t);
  const title = t("zone.metaTitle", { name: z.name, tier: z.tier });
  const description = t("zone.metaDesc", { name: z.name, tier: z.tier, resources: res, chests, dungeons });
  return {
    title: { absolute: `${title} | Avalon Tracker` },
    description,
    alternates: alternates(`/zones/${zoneSlug(z.name)}`, lang),
    openGraph: { title, description, url: `${SITE}${publicPath(lang, `/zones/${zoneSlug(z.name)}`)}`, locale: lang === "es" ? "es_ES" : "en_US" },
  };
}

export async function ZonePage({ params, lang }: { params: Promise<{ zone: string }>; lang: PublicLang }) {
  const z = zoneBySlug((await params).zone);
  if (!z) notFound();
  const t = publicT(lang);
  const slug = zoneSlug(z.name);
  const family = zoneFamily(z.zoneClass);
  const similar = similarZones(z);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("nav.zones"), item: `${SITE}${publicPath(lang, "/zones")}` },
      { "@type": "ListItem", position: 2, name: z.name, item: `${SITE}${publicPath(lang, `/zones/${slug}`)}` },
    ],
  };

  return (
    <PublicShell lang={lang} altHref={lang === "es" ? `/zones/${slug}` : `/es/zones/${slug}`}>
      <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      <Link href={publicPath(lang, "/zones")} className="text-sm text-indigo-300 hover:text-indigo-200">← {t("zone.back")}</Link>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{z.name}</h1>
        <p className="pb-1 text-slate-400">{t("zone.h1sub", { tier: z.tier })}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <h2 className="sr-only">{t("zone.map")}</h2>
          <ZoneMiniMap zone={z} t={t} />
          <MiniMapLegend zone={z} t={t} />
          <p className="mt-2 text-xs text-slate-500">{t("zone.map.note")}</p>
        </section>

        <div className="flex flex-col gap-4">
          <Card title={t("zone.class")}>
            <p className="text-white">{t(`family.${family}` as PublicKey)}</p>
            <p className="mt-1 text-xs text-slate-500">{t("zone.class.code")}: <code>{z.zoneClass}</code></p>
            {z.hasHideout && <p className="mt-2 text-sm text-indigo-300">{t("zone.hideout")}</p>}
          </Card>

          <Card title={t("zone.resources")}>
            {z.resources.length === 0 ? <p className="text-sm text-slate-400">{t("zone.resources.none")}</p> : (
              <ul className="space-y-1.5 text-sm">
                {resourceTypes(z).map((r) => {
                  const spots = z.resources.filter((x) => x.type === r);
                  const tiers = z.nodes.filter((n) => n.type === r);
                  return (
                    <li key={r} className="flex flex-wrap items-center gap-x-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESOURCE_COLOR[r] }} />
                      <span className="text-white">{t(`res.${r}` as PublicKey)}</span>
                      <span className="text-slate-400">{spots.map((s) => `${s.count}× ${t(`size.${s.size}` as PublicKey)}`).join(" · ")}</span>
                      {tiers.length > 0 && (
                        <span className="text-xs text-slate-500">— {t("zone.nodes")}: {tiers.map((n) => `T${n.tier}×${n.count}`).join(", ")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={t("zone.chests")}>
            {z.chests.length === 0 ? <p className="text-sm text-slate-400">{t("zone.chests.none")}</p> : (
              <ul className="space-y-1.5 text-sm">
                {CHEST_TYPES.flatMap((c) => z.chests.filter((x) => x.type === c)).map((c) => (
                  <li key={`${c.type}-${c.size}`} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: CHEST_COLOR[c.type] }} />
                    <span className="text-white">{c.count}× {t(`chest.${c.type}` as PublicKey)}</span>
                    <span className="text-slate-400">({t(`size.${c.size}` as PublicKey)})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("zone.dungeons")}>
            {z.dungeons.length === 0 ? <p className="text-sm text-slate-400">{t("zone.dungeons.none")}</p> : (
              <ul className="space-y-1.5 text-sm">
                {DUNGEON_TYPES.flatMap((d) => z.dungeons.filter((x) => x.type === d)).map((d) => (
                  <li key={`${d.type}-${d.size}`} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rotate-45" style={{ backgroundColor: DUNGEON_COLOR[d.type] }} />
                    <span className="text-white">{d.count}× {t(`dng.${d.type}` as PublicKey)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-indigo-800/60 bg-indigo-950/30 p-5">
          <h2 className="text-lg font-semibold text-white">{t("zone.cta.title")}</h2>
          <p className="mt-2 text-sm text-slate-300">{t("zone.cta.body")}</p>
          <Link href={`/map?from=${encodeURIComponent(z.name)}`} className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            {t("zone.cta.button")}
          </Link>
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-lg font-semibold text-white">{t("zone.exits.title")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("zone.exits.body")}</p>
          <Link href={publicPath(lang, "/exits")} className="mt-4 inline-block text-sm font-semibold text-indigo-300 hover:text-indigo-200">{t("nav.exits")} →</Link>
          <h2 className="mt-5 text-base font-semibold text-white">{t("zone.guild.title")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t("zone.guild.body")}</p>
          <Link href="/#guilds" className="mt-2 inline-block text-sm font-semibold text-indigo-300 hover:text-indigo-200">{t("zone.guild.button")} →</Link>
        </section>
      </div>

      {similar.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white">{t("zone.similar")}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((o) => (
              <li key={o.name}>
                <Link href={publicPath(lang, `/zones/${zoneSlug(o.name)}`)} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm hover:bg-slate-900">
                  <span className="text-white">{o.name}</span>
                  <span className="flex items-center gap-1">
                    {resourceTypes(o).map((r) => <span key={r} className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: RESOURCE_COLOR[r] }} />)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SourceNote t={t} />
    </PublicShell>
  );
}

// ——— /exits ———

export function exitsMetadata(lang: PublicLang): Metadata {
  const t = publicT(lang);
  return {
    title: { absolute: t("exits.metaTitle") },
    description: t("exits.metaDesc"),
    alternates: alternates("/exits", lang),
    openGraph: { title: t("exits.metaTitle"), description: t("exits.metaDesc"), url: `${SITE}${publicPath(lang, "/exits")}`, locale: lang === "es" ? "es_ES" : "en_US" },
  };
}

export function ExitsPage({ lang }: { lang: PublicLang }) {
  const t = publicT(lang);
  return (
    <PublicShell lang={lang} altHref={lang === "es" ? "/exits" : "/es/exits"}>
      <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{t("exits.title")}</h1>
      <p className="mt-3 max-w-3xl text-slate-400">{t("exits.intro")}</p>
      <div className="mt-6"><ExitFinder lang={lang} avalonNames={AVALON_ZONES.map((z) => z.name)} /></div>
      <p className="mt-6 text-xs text-slate-500">{t("exits.note")}</p>
    </PublicShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function SourceNote({ t }: { t: PublicT }) {
  return (
    <p className="mt-10 text-xs text-slate-600">
      {t("zone.source", { commit: ZONES_SOURCE.commit.slice(0, 10) })}
    </p>
  );
}
