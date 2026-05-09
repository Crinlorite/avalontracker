import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  // URL limpia y estable para la privacy policy de la Chrome extension
  // (requisito de Chrome Web Store). El archivo real vive en
  // public/extension-privacy.html.
  async rewrites() {
    return [
      { source: "/extension-privacy", destination: "/extension-privacy.html" },
    ];
  },
  async headers() {
    // CSP intencionadamente permisivo en script-src/style-src ('unsafe-inline')
    // porque Next App Router requiere inline para hidratación. Cierra cargas
    // externas no autorizadas (img/connect/frame) que es donde se cuelan los
    // ataques más comunes (image beacons, exfil de datos vía fetch).
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://cdn.discordapp.com",
      "font-src 'self' data:",
      "connect-src 'self' https://discord.com https://discordapp.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions-Policy: deshabilitamos sensores tradicionales +
          // todas las features Privacy Sandbox (browsing-topics,
          // attribution-reporting, etc.) que algunos proxies/CDNs
          // habilitan por defecto. La app no usa publicidad ni tracking
          // cross-site. Brave/Firefox tirarán "Unrecognized feature"
          // warnings en consola para algunas — son de los browsers que
          // no implementan ese feature, no se pueden silenciar desde
          // server (las features no existen en esos browsers, así que
          // la directiva es literalmente "unrecognized").
          { key: "Permissions-Policy", value: [
            "camera=()",
            "microphone=()",
            "geolocation=()",
            "interest-cohort=()",
            "browsing-topics=()",
            "attribution-reporting=()",
            "run-ad-auction=()",
            "join-ad-interest-group=()",
            "private-state-token-issuance=()",
            "private-state-token-redemption=()",
            "private-aggregation=()",
          ].join(", ") },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
