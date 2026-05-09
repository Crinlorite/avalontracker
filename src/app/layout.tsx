import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import SessionProvider from "@/components/providers/SessionProvider";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import LanguageProvider from "@/components/providers/LanguageProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = "https://avalontracker.app";
const SITE_NAME = "Avalon Tracker";
const SITE_DESCRIPTION =
  "Mapa en vivo de los Caminos de Avalon para clanes de Albion Online. Comparte rutas con tu equipo, marca portales con expiración y coordina roams en tiempo real.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Caminos de Avalon en vivo para tu clan`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Crintech Studios", url: "https://crintech.pro" }],
  creator: "Crintech Studios",
  publisher: "Crintech Studios",
  category: "Game Companion",
  keywords: [
    "Avalon Tracker",
    "Caminos de Avalon",
    "Roads of Avalon",
    "Albion Online",
    "clan tracker",
    "avalon roads map",
    "portal expiration",
    "avalon routes",
    "guild coordination",
    "Albion companion",
  ],
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Caminos de Avalon en vivo`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Avalon Tracker — mapa en vivo de los Caminos de Avalon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Caminos de Avalon en vivo`,
    description:
      "Mapa colaborativo de los Caminos de Avalon: comparte rutas, marca portales y coordina tu clan en Albion Online.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#030712",
};

// JSON-LD WebApplication schema. Content is 100% hardcoded (no user
// input) and JSON.stringify never produces the `</script>` sequence
// for this shape, so passing it as a string child is XSS-safe and
// avoids dangerouslySetInnerHTML.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "GameApplication",
  applicationSubCategory: "MMORPG Companion Tool",
  operatingSystem: "Web",
  browserRequirements: "Requires a modern browser with JavaScript enabled.",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  creator: {
    "@type": "Organization",
    name: "Crintech Studios",
    url: "https://crintech.pro",
  },
  publisher: {
    "@type": "Organization",
    name: "Crintech Studios",
    url: "https://crintech.pro",
  },
  inLanguage: ["es", "en"],
  featureList: [
    "Mapa en vivo de los Caminos de Avalon",
    "Edición colaborativa de rutas por clan",
    "Marcado de portales con expiración",
    "Coordinación de roams entre miembros",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </head>
      <body
        className={`${inter.className} bg-gray-950 text-white antialiased min-h-screen`}
      >
        <SessionProvider>
          <SWRProvider>
            <LanguageProvider>
              {children}
              <ToastProvider />
            </LanguageProvider>
          </SWRProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
