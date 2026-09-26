import Link from "next/link";
import type { ReactNode } from "react";
import { publicT, publicPath, publicLangName, isBetaLang, PUBLIC_LANGS, type PublicLang } from "@/i18n/public";

export const REPO_URL = "https://github.com/Crinlorite/avalontracker";

// Marco de las páginas públicas: cabecera con navegación, selector de idioma
// (enlaces a la misma página en los 11 idiomas, sin JS) y pie con legales y
// créditos. `path` es la ruta sin prefijo de idioma (p. ej. /zones/casitos-atinaum).
export function PublicShell({ lang, path, children }: { lang: PublicLang; path: string; children: ReactNode }) {
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
            <details className="relative" data-testid="lang-switch">
              <summary className="cursor-pointer list-none rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:text-white" aria-label={t("lang.switch")}>
                {publicLangName(lang)}{isBetaLang(lang) && <span className="ml-1 text-[10px] uppercase text-amber-400/80">beta</span>} ▾
              </summary>
              <ul className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
                {PUBLIC_LANGS.map((l) => (
                  <li key={l}>
                    <Link href={publicPath(l, path)} hrefLang={l} lang={l} className={`flex items-center justify-between px-3 py-1.5 text-sm hover:bg-slate-800 ${l === lang ? "text-white" : "text-slate-300"}`}>
                      {publicLangName(l)}
                      {isBetaLang(l) && <span className="text-[10px] uppercase text-amber-400/80" title={t("lang.beta")}>beta</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 pb-10 pt-6 text-xs text-slate-500">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/legal/privacy" className="hover:text-slate-300">Privacy</Link>
          <Link href="/legal/cookies" className="hover:text-slate-300">Cookies</Link>
          <Link href="/legal/aviso-legal" className="hover:text-slate-300">{t("footer.legal")}</Link>
          <a href={REPO_URL} className="hover:text-slate-300" rel="noopener noreferrer">GitHub (MIT)</a>
        </nav>
        <p className="text-center">{t("footer.trademark")}</p>
      </footer>
    </div>
  );
}
