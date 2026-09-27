"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";

// Layout compartido por las 3 páginas legales. Subnav pill-style inspirado
// en crintech-static/politica-*/index.html. Ruta pública (sin auth).
export default function LegalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { lang } = useLanguage();

  const tabs = [
    { href: "/legal/privacy", labelEs: "Privacidad", labelEn: "Privacy" },
    { href: "/legal/cookies", labelEs: "Cookies", labelEn: "Cookies" },
    { href: "/legal/aviso-legal", labelEs: "Aviso legal", labelEn: "Legal notice" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-slate-300 hover:text-white">
            <BrandMark size={28} />
            <span className="font-semibold tracking-tight">Avalon Tracker</span>
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-900 hover:text-white"
            >
              {lang === "es" ? "Inicio" : "Home"}
            </Link>
            <span aria-hidden="true" className="px-0.5 text-slate-700">|</span>
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  {lang === "es" ? t.labelEs : t.labelEn}
                </Link>
              );
            })}
            <LanguageSwitcher className="ml-2" />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">{children}</main>
      <footer className="mx-auto max-w-3xl border-t border-slate-800/80 px-4 py-8 text-center text-xs text-slate-600">
        Crintech Studios · avalon@crintech.pro
      </footer>
    </div>
  );
}
