import { notFound } from "next/navigation";
import { ExitsPage, exitsMetadata } from "@/components/zones/pages";
import { isPublicLang } from "@/i18n/public";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ from?: string }> };

// Idioma desconocido → 404; /en/… lo redirige el middleware a la ruta sin prefijo.
function langOf(lang: string) {
  if (!isPublicLang(lang) || lang === "en") notFound();
  return lang;
}

export async function generateMetadata({ params }: Props) {
  return exitsMetadata(langOf((await params).lang));
}

// ?from=<zona de Avalon> preselecciona la zona de origen para «dónde vender».
export default async function Page({ params, searchParams }: Props) {
  return <ExitsPage lang={langOf((await params).lang)} from={(await searchParams).from} />;
}
