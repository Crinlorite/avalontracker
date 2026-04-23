// Diccionario i18n. Por ahora solo cubre el landing público y los textos
// más visibles del shell. Resto de la app sigue en español hardcoded —
// se irá portando key por key conforme abramos a usuarios EN.

export type Lang = "es" | "en";

export const translations: Record<Lang, Record<string, string>> = {
  es: {
    "landing.title": "Avalon Tracker",
    "landing.subtitle": "Mapeo colaborativo de Roads of Avalon para tu clan en Albion Online.",
    "landing.cta.signin": "Entrar con Discord",
    "landing.feature.realtime.title": "Tiempo real",
    "landing.feature.realtime.body": "Las rutas de tu clan se actualizan al instante con timers visibles para todos los miembros.",
    "landing.feature.graph.title": "Vista grafo",
    "landing.feature.graph.body": "Ramifica tu mapa nodo a nodo. Marca el portal cerrado, abre nuevas salidas y comparte la topología con un click.",
    "landing.feature.discord.title": "Integración Discord",
    "landing.feature.discord.body": "Roles del server Discord se traducen a permisos automáticamente. Webhook de notificaciones por canal.",
    "landing.requirement": "Tu clan necesita {vigil} instalado en su servidor Discord.",
    "landing.privacy": "Solo identify + email. Sin spam, sin anuncios.",
    "landing.footer": "Hecho por Crintech · open source-friendly",
  },
  en: {
    "landing.title": "Avalon Tracker",
    "landing.subtitle": "Collaborative Roads of Avalon mapping for your Albion Online clan.",
    "landing.cta.signin": "Sign in with Discord",
    "landing.feature.realtime.title": "Real time",
    "landing.feature.realtime.body": "Your clan routes update instantly with timers visible to every member.",
    "landing.feature.graph.title": "Graph view",
    "landing.feature.graph.body": "Branch your map node by node. Mark closed portals, open new exits, share the topology in one click.",
    "landing.feature.discord.title": "Discord integration",
    "landing.feature.discord.body": "Discord server roles map to app permissions automatically. Webhook channel notifications.",
    "landing.requirement": "Your clan needs {vigil} installed on its Discord server.",
    "landing.privacy": "Only identify + email scope. No spam, no ads.",
    "landing.footer": "Built by Crintech · open source-friendly",
  },
};
