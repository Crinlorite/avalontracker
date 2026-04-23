"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { translations, type Lang } from "@/i18n/translations";

const STORAGE_KEY = "avalon-lang";

type Ctx = {
  lang: Lang;
  t: (key: string, vars?: Record<string, string>) => string;
  setLanguage: (l: Lang) => void;
};

const LanguageContext = createContext<Ctx | null>(null);

function detectInitial(): Lang {
  if (typeof window === "undefined") return "es";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "es" || stored === "en") return stored;
  // fallback al lenguaje del navegador
  const nav = navigator.language?.toLowerCase() ?? "";
  if (nav.startsWith("en")) return "en";
  return "es";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR-safe: empieza en "es" (servidor no tiene window) y se rectifica en el primer render.
  const [lang, setLang] = useState<Lang>("es");

  useEffect(() => {
    setLang(detectInitial());
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let s = translations[lang]?.[key] ?? translations.en?.[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, v);
        }
      }
      return s;
    },
    [lang],
  );

  const setLanguage = useCallback((l: Lang) => {
    setLang(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage debe usarse dentro de <LanguageProvider>");
  return ctx;
}
