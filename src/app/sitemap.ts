import type { MetadataRoute } from "next";
import { AVALON_ZONES, zoneSlug, ZONES_SOURCE } from "@/lib/avalon-zones";
import { PUBLIC_LANGS, publicPath } from "@/i18n/public";

/**
 * Dynamic sitemap.xml generator — Next.js App Router convention.
 * Served at /sitemap.xml automatically.
 *
 * Only public, non-auth pages are listed. Dashboard / clan / API
 * routes are intentionally excluded (they require sign-in).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = "https://avalontracker.app";

  // Páginas públicas en los 11 idiomas, enlazadas entre sí (hreflang); el
  // inglés vive sin prefijo y es el x-default.
  const dataDate = new Date(ZONES_SOURCE.generatedAt);
  const languages = (path: string) => ({
    ...Object.fromEntries(PUBLIC_LANGS.map((l) => [l, `${base}${publicPath(l, path)}`])),
    "x-default": `${base}${path}`,
  });
  const multilingual = (path: string, priority: number, lastModified: Date): MetadataRoute.Sitemap =>
    PUBLIC_LANGS.map((lang) => ({
      url: `${base}${publicPath(lang, path)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority,
      alternates: { languages: languages(path) },
    }));

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...multilingual("/zones", 0.9, dataDate),
    ...multilingual("/exits", 0.8, dataDate),
    ...AVALON_ZONES.flatMap((z) => multilingual(`/zones/${zoneSlug(z.name)}`, 0.6, dataDate)),
    {
      url: `${base}/legal/aviso-legal`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/legal/cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/extension-privacy.html`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
