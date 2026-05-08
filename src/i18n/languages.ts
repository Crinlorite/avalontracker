// Lista oficial de idiomas soportados. Heredada de Royal Forge (sin
// `anh` Andalûh). Tres grupos:
//   - "language": idiomas globales/internacionales
//   - "regional": variantes peninsulares y catalanas
//   - "community": peticiones de la comunidad
//
// `beta: true` indica que la traducción no es nativa y puede tener
// errores. La UI lo señaliza con un badge para fijar expectativas.
// `rtl: true` activa dirección de texto right-to-left (árabe).

export type LangGroup = "language" | "regional" | "community";

export type LanguageDef = {
  code: string;
  native: string;
  english: string;
  group: LangGroup;
  beta?: boolean;
  rtl?: boolean;
};

export const LANGUAGES: LanguageDef[] = [
  // — Idiomas internacionales —
  { code: "en", native: "English",     english: "English",          group: "language" },
  { code: "es", native: "Español",     english: "Spanish",          group: "language" },
  { code: "de", native: "Deutsch",     english: "German",           group: "language", beta: true },
  { code: "fr", native: "Français",    english: "French",           group: "language", beta: true },
  { code: "ru", native: "Русский",     english: "Russian",          group: "language", beta: true },
  { code: "pl", native: "Polski",      english: "Polish",           group: "language", beta: true },
  { code: "pt", native: "Português",   english: "Portuguese (BR)",  group: "language", beta: true },
  { code: "it", native: "Italiano",    english: "Italian",          group: "language", beta: true },
  { code: "zh", native: "中文",         english: "Chinese",          group: "language", beta: true },
  { code: "ja", native: "日本語",        english: "Japanese",         group: "language", beta: true },
  { code: "ko", native: "한국어",        english: "Korean",           group: "language", beta: true },

  // — Regional (España / Cataluña / Galicia / etc) —
  { code: "ca",  native: "Català",     english: "Catalan",          group: "regional", beta: true },
  { code: "gl",  native: "Galego",     english: "Galician",         group: "regional", beta: true },
  { code: "eu",  native: "Euskara",    english: "Basque",           group: "regional", beta: true },
  { code: "oc",  native: "Aranés",     english: "Aranese (Occitan)", group: "regional", beta: true },
  { code: "va",  native: "Valencià",   english: "Valencian",        group: "regional", beta: true },
  { code: "ast", native: "Asturianu",  english: "Asturian",         group: "regional", beta: true },

  // — Community (peticiones explícitas) —
  { code: "ar",  native: "العربية",    english: "Arabic",           group: "community", beta: true, rtl: true },
  { code: "tr",  native: "Türkçe",     english: "Turkish",          group: "community", beta: true },
  { code: "id",  native: "Indonesia",  english: "Indonesian",       group: "community", beta: true },
  { code: "vi",  native: "Tiếng Việt", english: "Vietnamese",       group: "community", beta: true },
  { code: "hi",  native: "हिन्दी",       english: "Hindi",            group: "community", beta: true },
  { code: "th",  native: "ไทย",         english: "Thai",             group: "community", beta: true },
  { code: "fil", native: "Filipino",   english: "Filipino (Tagalog)", group: "community", beta: true },
];

export const SUPPORTED_LANG_CODES = LANGUAGES.map((l) => l.code);
export type LangCode = string; // permitir cualquier código; runtime valida

export function isSupportedLang(code: string): boolean {
  return SUPPORTED_LANG_CODES.includes(code);
}

export function findLanguage(code: string): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function isRtl(code: string): boolean {
  return findLanguage(code)?.rtl === true;
}

// Códigos no-beta: solo en + es. Esto sirve para que el UI marque el
// resto como "preview" hasta que el usuario decida que están maduras.
export const NON_BETA_LANGS = LANGUAGES.filter((l) => !l.beta).map((l) => l.code);
