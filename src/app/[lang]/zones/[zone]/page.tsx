import { notFound } from "next/navigation";
import { ZonePage, zoneMetadata } from "@/components/zones/pages";
import { isPublicLang } from "@/i18n/public";

type Props = { params: Promise<{ lang: string; zone: string }> };

// Idioma desconocido → 404; /en/… lo redirige el middleware a la ruta sin prefijo.
function langOf(lang: string) {
  if (!isPublicLang(lang) || lang === "en") notFound();
  return lang;
}

export async function generateMetadata({ params }: Props) {
  return zoneMetadata(params, langOf((await params).lang));
}

export default async function Page({ params }: Props) {
  return <ZonePage params={params} lang={langOf((await params).lang)} />;
}
