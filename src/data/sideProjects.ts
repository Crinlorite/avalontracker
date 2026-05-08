// Side projects del ecosistema Crintech que compartimos en el landing.
// Patrón portado de albionforge-static (Royal Forge): cada entry aparece
// como card con icon + tags + descripción + dominio, click-through al
// sitio externo. Cubre reciprocidad entre las herramientas "hermanas".
//
// NO incluir Avalon Tracker aquí (somos este propio proyecto).

import type { Lang } from "@/i18n/translations";

export type SideProject = {
  id: string;
  icon: string;
  name: string;
  url: string;
  tags: Record<Lang, string[]>;
  desc: Record<Lang, string>;
};

export const SIDE_PROJECTS: SideProject[] = [
  {
    id: "royalforge",
    icon: "⚒️",
    name: "Royal Forge",
    url: "https://royalforge.crintech.pro",
    tags: {
      en: ["Build maker", "Killboard", "Market", "Free"],
      es: ["Build maker", "Killboard", "Mercado", "Gratis"],
    },
    desc: {
      en: "Albion Online companion web: build maker, killboard, player/guild study, market flipper, and more. No accounts, no ads — all data lives locally in your browser.",
      es: "Companion web de Albion Online: build maker, killboard, estudio de jugadores/gremios, flipper de mercado y más. Sin cuentas, sin anuncios — todos los datos viven localmente en tu navegador.",
    },
  },
  {
    id: "royalsearch",
    icon: "🔍",
    name: "Royal Search",
    url: "https://chromewebstore.google.com/detail/royal-search/ahhnoloclfmglfbflaliljodonbbpbmc",
    tags: {
      en: ["Extension", "Command palette", "Fast lookup"],
      es: ["Extensión", "Command palette", "Búsqueda rápida"],
    },
    desc: {
      en: "Chrome extension + desktop launcher to jump straight into Royal Forge searches, items, builds and killboards from anywhere. Cmd+K / Ctrl+K style interface.",
      es: "Extensión de Chrome + launcher de escritorio para saltar directo a búsquedas, items, builds y killboards de Royal Forge desde cualquier sitio. Interfaz estilo Cmd+K / Ctrl+K.",
    },
  },
  {
    id: "vigil",
    icon: "👁️",
    name: "Vigil",
    url: "https://vigil.crintech.pro",
    tags: {
      en: ["Discord bot", "Killboard", "Reminders"],
      es: ["Bot de Discord", "Killboard", "Recordatorios"],
    },
    desc: {
      en: "Discord companion bot for Albion guilds. Live killboard tracker with fame thresholds, TTS announcements, scheduled reminders, and a web dashboard. Required by Avalon Tracker for Discord role sync.",
      es: "Bot companion de Discord para clanes de Albion. Tracker de killboard en vivo con umbrales de fama, anuncios TTS, recordatorios programados y dashboard web. Necesario en Avalon Tracker para sincronizar roles de Discord.",
    },
  },
  {
    id: "aoinvoice",
    icon: "⚔️",
    name: "Albion Invoice",
    url: "https://aoinvoice.crintech.pro",
    tags: {
      en: ["Invoices", "Bilingual", "PDF export"],
      es: ["Facturas", "Bilingüe", "Exporta PDF"],
    },
    desc: {
      en: "Medieval-styled invoice generator for Albion Online. Document silver loans, island rent, guild services — with live preview, tier badges, multiple due dates, and direct A4 PDF export. Fully static, nothing leaves your browser.",
      es: "Generador de facturas con estética medieval para Albion Online. Documenta préstamos de plata, alquileres de islas, servicios de clan — con preview en vivo, badges de tier, múltiples vencimientos y exportación directa a PDF A4. 100% estático, nada sale de tu navegador.",
    },
  },
];
