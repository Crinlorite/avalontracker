import type { MetadataRoute } from "next";

/**
 * Dynamic robots.txt generator — Next.js App Router convention.
 * Served at /robots.txt automatically.
 *
 * Policy mirrors the one used across the Crintech ecosystem: allow
 * search indexing, disallow the REST API and clan-scoped dashboard
 * routes (those need authentication anyway), and advertise the
 * sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/clan/"],
      },
      // Block known AI training crawlers. Keep search crawlers untouched.
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "Google-Extended", disallow: "/" },
      { userAgent: "Applebot-Extended", disallow: "/" },
      { userAgent: "Bytespider", disallow: "/" },
      { userAgent: "Amazonbot", disallow: "/" },
      { userAgent: "meta-externalagent", disallow: "/" },
    ],
    sitemap: "https://avalontracker.app/sitemap.xml",
  };
}
