"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { translate, SUPPORTED, type Lang } from "@/i18n/translations";
import { isRtl } from "@/i18n/languages";

export type { Lang };

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
  if (stored && SUPPORTED.includes(stored)) return stored;
  // Fallback al lenguaje del navegador. Probamos primero el código
  // completo (es-ES → es), luego algunos casos especiales (pt-BR → pt).
  const nav = navigator.language?.toLowerCase() ?? "";
  if (!nav) return "es";
  if (SUPPORTED.includes(nav)) return nav;
  const short = nav.split("-")[0];
  if (SUPPORTED.includes(short)) return short;
  // Default a EN si no detectamos nada — la mayor parte del mundo lo
  // entiende. Solo caemos a ES si el navegador lo dice explícitamente.
  if (nav.startsWith("es")) return "es";
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR-safe: empieza en "es" (servidor no tiene window) y se rectifica
  // en el primer render.
  const [lang, setLang] = useState<Lang>("es");

  useEffect(() => {
    setLang(detectInitial());
  }, []);

  // Aplica dir="rtl" al <html> cuando el idioma es RTL (árabe). Otros
  // idiomas resetean a "ltr". Así estilos que dependen de la dirección
  // (margin-left vs margin-right en flexbox) se resuelven solos.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => translate(lang, key, vars),
    [lang],
  );

  const setLanguage = useCallback((l: Lang) => {
    if (!SUPPORTED.includes(l)) return; // ignorar códigos no soportados
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
