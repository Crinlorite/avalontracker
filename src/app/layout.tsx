import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import SessionProvider from "@/components/providers/SessionProvider";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import LanguageProvider from "@/components/providers/LanguageProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avalon Tracker",
  description: "Comparte rutas avalonianas con tu clan",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Avalon Tracker",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#030712",
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
