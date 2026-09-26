import { notFound } from "next/navigation";
import { ZonesIndexPage, zonesIndexMetadata } from "@/components/zones/pages";
import { isPublicLang } from "@/i18n/public";

type Props = { params: Promise<{ lang: string }> };

// Idioma desconocido → 404; /en/… lo redirige el middleware a la ruta sin prefijo.
function langOf(lang: string) {
  if (!isPublicLang(lang) || lang === "en") notFound();
  return lang;
}

export async function generateMetadata({ params }: Props) {
  return zonesIndexMetadata(langOf((await params).lang));
}

export default async function Page({ params }: Props) {
  return <ZonesIndexPage lang={langOf((await params).lang)} />;
}
