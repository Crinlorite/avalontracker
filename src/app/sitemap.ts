import type { MetadataRoute } from "next";

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

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
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
