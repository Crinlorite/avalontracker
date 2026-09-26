import Link from "next/link";
import type { ReactNode } from "react";
import { publicT, publicPath, type PublicLang } from "@/i18n/public";

export const REPO_URL = "https://github.com/Crinlorite/avalontracker";

// Marco de las páginas públicas: cabecera con navegación, cambio de
// idioma a la página equivalente y pie con legales y créditos.
export function PublicShell({ lang, altHref, children }: { lang: PublicLang; altHref: string; children: ReactNode }) {
  const t = publicT(lang);
  const p = (x: string) => publicPath(lang, x);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/" className="mr-auto flex items-center gap-2 font-semibold text-white">
            <span aria-hidden>🌀</span> Avalon Tracker
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link href={p("/zones")} className="text-slate-300 hover:text-white">{t("nav.zones")}</Link>
            <Link href={p("/exits")} className="text-slate-300 hover:text-white">{t("nav.exits")}</Link>
            <Link href="/map" className="text-slate-300 hover:text-white">{t("nav.map")}</Link>
            <Link href="/#guilds" className="text-slate-300 hover:text-white">{t("nav.guilds")}</Link>
            <Link href={altHref} hrefLang={lang === "es" ? "en" : "es"} className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:text-white">
              {t("lang.other")}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 pb-10 pt-6 text-xs text-slate-500">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <a href="/legal/privacy" className="hover:text-slate-300">Privacy</a>
          <a href="/legal/cookies" className="hover:text-slate-300">Cookies</a>
          <a href="/legal/aviso-legal" className="hover:text-slate-300">{lang === "es" ? "Aviso legal" : "Legal notice"}</a>
          <a href={REPO_URL} className="hover:text-slate-300" rel="noopener noreferrer">GitHub (MIT)</a>
        </nav>
        <p className="text-center">
          {lang === "es"
            ? "Albion Online es una marca de Sandbox Interactive GmbH. Avalon Tracker es una herramienta de fans, sin relación oficial."
            : "Albion Online is a trademark of Sandbox Interactive GmbH. Avalon Tracker is a fan-made tool with no official affiliation."}
        </p>
      </footer>
    </div>
  );
}
