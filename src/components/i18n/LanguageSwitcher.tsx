"use client";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/i18n/translations";

// Selector compacto de idioma. Inspirado en el de Royal Forge: dos
// banderas-pill con la activa resaltada. Click en la inactiva la activa.
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLanguage } = useLanguage();

  return (
    <div
      role="group"
      aria-label={lang === "es" ? "Seleccionar idioma" : "Language selector"}
      className={`inline-flex items-center gap-0.5 rounded-md border border-slate-700/50 bg-white/[0.02] p-0.5 ${className}`}
    >
      <FlagButton flag="es" active={lang === "es"} label="Español" onClick={() => setLanguage("es")} />
      <FlagButton flag="en" active={lang === "en"} label="English" onClick={() => setLanguage("en")} />
    </div>
  );
}

function FlagButton({
  flag, active, label, onClick,
}: { flag: Lang; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center justify-center rounded px-1.5 py-1 transition-all ${
        active
          ? "bg-amber-500/20 ring-1 ring-amber-400/40 opacity-100"
          : "opacity-40 hover:opacity-75 cursor-pointer"
      }`}
    >
      {flag === "es" ? <FlagES /> : <FlagEN />}
    </button>
  );
}

function FlagES() {
  return (
    <svg viewBox="0 0 3 2" width={20} height={14} className="block rounded-[2px] shrink-0" aria-label="Spain flag">
      <rect width="3" height="2" fill="#C60B1E" />
      <rect width="3" height="1" y="0.5" fill="#FFC400" />
    </svg>
  );
}

// Bandera UK (Union Jack simplificada) — más universal que US para "English".
function FlagEN() {
  return (
    <svg viewBox="0 0 60 30" width={20} height={14} className="block rounded-[2px] shrink-0" aria-label="UK flag">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="3" clipPath="url(#t)" />
      <path d="M30,0 V30 M0,15 H60" stroke="#FFF" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
