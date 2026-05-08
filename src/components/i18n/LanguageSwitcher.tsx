"use client";
import { useState, useRef, useEffect } from "react";
import { LANGUAGES, findLanguage, type LangGroup, type LanguageDef } from "@/i18n/languages";
import { useLanguage } from "@/contexts/LanguageContext";

// Switcher de idioma como panel grande, no como roll-menu compacto.
// Inspirado en el LanguageFooter de euskera-static (mismo padre
// Crintech): tres secciones tipográficas con grid 2-col, badges
// "Beta" sutiles, link al feedback al final. Paleta Avalon: indigo
// como accent (sustituye el rojo de euskera), slate para fondos.

const SECTION_LABELS: Record<LangGroup, { en: string; es: string }> = {
  language:  { en: "Languages",  es: "Idiomas" },
  regional:  { en: "Regional",   es: "Regionales" },
  community: { en: "Community",  es: "Comunidad" },
};

const SECTION_ORDER: LangGroup[] = ["language", "regional", "community"];

export function LanguageSwitcher({
  className = "",
  direction = "down",
  align,
}: {
  className?: string;
  direction?: "up" | "down";
  // "left" → panel crece hacia la derecha (anchor en left-0). Útil
  // cuando el trigger vive cerca del borde izquierdo del viewport
  // (sidebar). "right" → panel crece hacia la izquierda (right-0).
  // Por defecto: "right" si direction="down" (top de la página),
  // "left" si direction="up" (sidebar al pie del aside).
  align?: "left" | "right";
}) {
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = findLanguage(lang);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const groups: Record<LangGroup, LanguageDef[]> = {
    language: [], regional: [], community: [],
  };
  for (const l of LANGUAGES) groups[l.group].push(l);

  const sectionHeading = (g: LangGroup) =>
    lang === "es" ? SECTION_LABELS[g].es : SECTION_LABELS[g].en;

  const effectiveAlign = align ?? (direction === "up" ? "left" : "right");

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-800"
        title={current ? `${current.native} · ${current.english}` : "Select language"}
        aria-label={lang === "es" ? "Cambiar idioma" : "Change language"}
        aria-expanded={open}
      >
        <Globe className={`h-4 w-4 transition-colors ${open ? "text-indigo-400" : "text-slate-400"}`} />
        <span className="text-xs font-mono uppercase text-slate-400">{current?.code ?? lang}</span>
        <span className="hidden md:inline">{current?.native}</span>
        <span
          className={`text-[10px] text-slate-500 transition-transform ${open ? "rotate-180 text-indigo-400" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[min(92vw,440px)] rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl ${
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2"
          } ${effectiveAlign === "left" ? "left-0" : "right-0"}`}
          role="menu"
        >
          <div className="grid gap-5">
            {SECTION_ORDER.map((g) => {
              const items = groups[g];
              if (items.length === 0) return null;
              return (
                <section key={g}>
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {sectionHeading(g)}
                  </h4>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {items.map((l) => {
                      const active = l.code === lang;
                      return (
                        <li key={l.code}>
                          <button
                            type="button"
                            onClick={() => { setLanguage(l.code); setOpen(false); }}
                            className={`flex w-full items-baseline gap-2 rounded-md py-0.5 text-left text-sm transition-colors ${
                              active
                                ? "font-semibold text-indigo-300"
                                : "text-slate-300 hover:text-indigo-300"
                            }`}
                            lang={l.code}
                            dir={l.rtl ? "rtl" : "ltr"}
                          >
                            <span className="truncate">{l.native}</span>
                            {l.beta && (
                              <span className="ml-auto rounded-full bg-amber-900/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-300/80">
                                beta
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="mt-5 border-t border-slate-800 pt-3 text-xs text-slate-500">
            {lang === "es"
              ? <>¿Hablas alguno? <a href="/feedback" className="font-semibold text-indigo-400 underline-offset-2 hover:underline">Ayúdanos a traducir</a>.</>
              : <>Speak one? <a href="/feedback" className="font-semibold text-indigo-400 underline-offset-2 hover:underline">Help us translate</a>.</>}
          </p>
        </div>
      )}
    </div>
  );
}

function Globe({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0 -18" />
    </svg>
  );
}
