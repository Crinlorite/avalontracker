"use client";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SIDE_PROJECTS, type SideProject } from "@/data/sideProjects";
import type { Lang } from "@/i18n/translations";

export function LandingLoginDiscord() {
  const { t, lang } = useLanguage();

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Fondo: gradiente + grid sutil + glow indigo */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-900" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-indigo-600/30 blur-[120px]" />
      <div className="absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-purple-600/20 blur-[120px]" />

      {/* Top bar — selector de idioma */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="text-2xl">🌀</span>
          <span className="font-semibold tracking-tight">Avalon Tracker</span>
        </div>
        <LanguageSwitcher />
      </header>

      {/* Contenido principal */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 py-10 md:py-20">
        <h1 className="text-center text-5xl font-extrabold tracking-tight text-white md:text-7xl">
          <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
            {t("landing.title")}
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-center text-lg leading-relaxed text-slate-300 md:text-xl">
          {t("landing.subtitle")}
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
            className="group relative inline-flex items-center gap-3 rounded-xl bg-[#5865F2] px-8 py-4 font-semibold text-white shadow-[0_8px_30px_rgba(88,101,242,0.45)] transition-all hover:scale-[1.02] hover:bg-[#4752c4] hover:shadow-[0_12px_40px_rgba(88,101,242,0.6)] active:scale-100"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            {t("landing.cta.signin")}
          </button>
          <p className="text-xs text-slate-500">{t("landing.privacy")}</p>
        </div>

        {/* Features */}
        <section className="mt-20 grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          <Feature
            icon="⚡"
            title={t("landing.feature.realtime.title")}
            body={t("landing.feature.realtime.body")}
          />
          <Feature
            icon="🕸"
            title={t("landing.feature.graph.title")}
            body={t("landing.feature.graph.body")}
          />
          <Feature
            icon="🤖"
            title={t("landing.feature.discord.title")}
            body={t("landing.feature.discord.body")}
          />
        </section>

        {/* Related tools — reciprocidad de ecosistema Crintech */}
        <section className="mt-20 w-full max-w-5xl">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800/80 pb-3">
            <h2 className="text-xl font-semibold text-white">
              {t("landing.family.title")}
            </h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">
              {t("landing.family.subtitle")}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SIDE_PROJECTS.map((p) => (
              <SideProjectCard key={p.id} project={p} lang={lang} />
            ))}
          </div>
        </section>

        {/* Requisito Vigil Bot */}
        <p className="mt-12 max-w-xl text-center text-sm text-slate-400">
          {(() => {
            const text = t("landing.requirement");
            const parts = text.split("{vigil}");
            return (
              <>
                {parts[0]}
                <a
                  href="https://vigil.crintech.pro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-indigo-400 underline-offset-2 hover:underline"
                >
                  Vigil Bot
                </a>
                {parts[1]}
              </>
            );
          })()}
        </p>

        {/* Footer con legal */}
        <footer className="mt-16 flex flex-col items-center gap-3 text-xs text-slate-600">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <a href="/legal/privacy" className="hover:text-slate-400">{t("landing.footer.privacy")}</a>
            <span aria-hidden="true" className="text-slate-800">·</span>
            <a href="/legal/cookies" className="hover:text-slate-400">{t("landing.footer.cookies")}</a>
            <span aria-hidden="true" className="text-slate-800">·</span>
            <a href="/legal/aviso-legal" className="hover:text-slate-400">{t("landing.footer.legal")}</a>
          </nav>
          <p>{t("landing.footer")}</p>
        </footer>
      </div>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur transition-all hover:border-indigo-700/60 hover:bg-slate-900/70">
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="mb-3 text-3xl">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function SideProjectCard({ project, lang }: { project: SideProject; lang: Lang }) {
  const hostname = project.url.replace(/^https?:\/\//, "").replace(/\/.*/, "");
  return (
    <a
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex gap-4 rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 transition-all hover:border-indigo-700/60 hover:bg-slate-900/70"
    >
      <div className="shrink-0 text-3xl leading-none">{project.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">{project.name}</span>
          <div className="flex flex-wrap gap-1">
            {project.tags[lang].map((tag, i) => (
              <span
                key={i}
                className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs leading-relaxed text-slate-400">{project.desc[lang]}</p>
        <div className="text-[11px] font-mono text-indigo-400/80 group-hover:text-indigo-300">
          {hostname} →
        </div>
      </div>
    </a>
  );
}
