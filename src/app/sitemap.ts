import type { MetadataRoute } from "next";
import { AVALON_ZONES, zoneSlug, ZONES_SOURCE } from "@/lib/avalon-zones";

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

  // Páginas públicas con versión EN y ES enlazadas entre sí (hreflang).
  const dataDate = new Date(ZONES_SOURCE.generatedAt);
  const bilingual = (path: string, priority: number, lastModified: Date): MetadataRoute.Sitemap =>
    (["en", "es"] as const).map((lang) => ({
      url: `${base}${lang === "es" ? "/es" : ""}${path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority,
      alternates: { languages: { en: `${base}${path}`, es: `${base}/es${path}` } },
    }));

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...bilingual("/zones", 0.9, dataDate),
    ...bilingual("/exits", 0.8, dataDate),
    ...AVALON_ZONES.flatMap((z) => bilingual(`/zones/${zoneSlug(z.name)}`, 0.6, dataDate)),
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
