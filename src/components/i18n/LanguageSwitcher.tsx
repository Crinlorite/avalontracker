"use client";
import { useState, useRef, useEffect } from "react";
import { LANGUAGES, findLanguage, type LangGroup, type LanguageDef } from "@/i18n/languages";
import { useLanguage } from "@/contexts/LanguageContext";

// Switcher de idioma con dropdown agrupado: language / regional /
// community (mismo esquema que Royal Forge). El botón muestra el
// código del idioma actual + 🌐. El menú lista todos los soportados
// con nombre nativo + nombre en inglés + badge BETA si aplica.

const GROUP_LABELS: Record<LangGroup, { en: string; es: string }> = {
  language:  { en: "Languages", es: "Idiomas" },
  regional:  { en: "Regional",  es: "Regionales" },
  community: { en: "Community", es: "Comunidad" },
};

const GROUP_ORDER: LangGroup[] = ["language", "regional", "community"];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
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

  const groupHeading = (g: LangGroup) =>
    lang === "es" ? GROUP_LABELS[g].es : GROUP_LABELS[g].en;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase text-slate-200 hover:border-slate-500 hover:bg-slate-800"
        title={current ? `${current.native} · ${current.english}` : "Select language"}
        aria-label={lang === "es" ? "Cambiar idioma" : "Change language"}
        aria-expanded={open}
      >
        <span aria-hidden>🌐</span>
        <span>{current?.code ?? lang}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 max-h-[480px] w-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
          role="menu"
        >
          {GROUP_ORDER.map((g) => (
            <div key={g}>
              <div className="sticky top-0 border-b border-slate-800 bg-slate-950/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {groupHeading(g)}
              </div>
              <ul>
                {groups[g].map((l) => {
                  const active = l.code === lang;
                  return (
                    <li key={l.code}>
                      <button
                        type="button"
                        onClick={() => { setLanguage(l.code); setOpen(false); }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                          active ? "bg-indigo-950/40 text-indigo-300" : "text-slate-200"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-8 flex-shrink-0 font-mono text-xs uppercase text-slate-500">
                            {l.code}
                          </span>
                          <span className="truncate" lang={l.code} dir={l.rtl ? "rtl" : "ltr"}>
                            {l.native}
                          </span>
                          <span className="truncate text-xs text-slate-500">
                            · {l.english}
                          </span>
                        </span>
                        {l.beta && (
                          <span className="flex-shrink-0 rounded bg-amber-900/40 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                            beta
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">
            {lang === "es"
              ? "Las traducciones BETA pueden tener errores. Sugiere correcciones en el feedback."
              : "BETA translations may contain errors. Submit corrections via feedback."}
          </div>
        </div>
      )}
    </div>
  );
}
