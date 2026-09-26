// Prefijo de idioma de las rutas públicas (/es/zones/…, /de/exits…). Sin
// dependencias de Next: lo usan el middleware y los tests.
import { isPublicLang, type PublicLang } from "@/i18n/public";

export type PublicPath = { lang: PublicLang | null; rest: string; explicitEn: boolean };

// - sin prefijo (o un segmento que no es un código de dos letras) → inglés;
// - /en/… → inglés explícito (el middleware lo redirige a la ruta sin prefijo);
// - /xx/… con un código de dos letras que no es idioma público → null
//   (la página [lang] responde 404).
export function parsePublicPath(pathname: string): PublicPath {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  if (!m) return { lang: "en", rest: pathname, explicitEn: false };
  const code = m[1];
  const rest = m[2] && m[2] !== "" ? m[2] : "/";
  if (code === "en") return { lang: "en", rest, explicitEn: true };
  if (isPublicLang(code)) return { lang: code, rest, explicitEn: false };
  return { lang: null, rest: pathname, explicitEn: false };
}
