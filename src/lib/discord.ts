import { isDiscordWebhookUrl } from "@/lib/webhook-url";

interface HopInfo {
  fromZone: string;
  toZone: string;
  portalSize: number;
  expiresAt: string;
  status: string;
}

interface RouteInfo {
  hops: HopInfo[];
  createdBy: string;
  status: string;
}

export async function sendRouteToDiscord(
  webhookUrl: string,
  route: RouteInfo,
  headerText?: string,
) {
  // Defensa en profundidad: si por alguna ruta de update directa a BD se
  // hubiera saltado la validación de schema, aquí garantizamos que solo
  // hacemos fetch a URLs reales de Discord.
  if (!isDiscordWebhookUrl(webhookUrl)) {
    throw new Error("Webhook URL no válida (debe ser de discord.com)");
  }

  const color =
    route.status === "ACTIVE"
      ? 0x22c55e
      : route.status === "DISABLED"
        ? 0xef4444
        : 0x6b7280;

  const zones = [route.hops[0].fromZone, ...route.hops.map((h) => h.toZone)];
  const title = zones.join(" → ");

  const fields = route.hops.map((hop, i) => {
    const expiresDate = new Date(hop.expiresAt);
    const discordTimestamp = Math.floor(expiresDate.getTime() / 1000);
    return {
      name: `Puerta ${i + 1}: ${hop.fromZone} → ${hop.toZone}`,
      value: `Portal: **${hop.portalSize}p** | Expira: <t:${discordTimestamp}:R>`,
      inline: false,
    };
  });

  fields.push({
    name: "Registrado por",
    value: route.createdBy,
    inline: true,
  });

  const embed = {
    title: `🗺️ ${title}`,
    color,
    fields,
    footer: {
      text: `Avalon Tracker | ${route.hops.length} ${route.hops.length === 1 ? "puerta" : "puertas"}`,
    },
    timestamp: new Date().toISOString(),
  };

  // headerText sale como `content` (texto encima del embed). Lo envolvemos
  // con `# ` (h1 de Discord) — es el único mecanismo nativo para texto
  // grande + negrita; Discord no soporta sizing arbitrario en pt.
  // Si el usuario ya empezó con `#`/`##`/`###` se lo respetamos para que
  // pueda elegir un nivel más pequeño si quiere.
  // allowed_mentions: { parse: [] } evita que se cuele @here/@everyone/role
  // desde el input del modal.
  const payload: Record<string, unknown> = { embeds: [embed] };
  if (headerText && headerText.trim()) {
    const clean = headerText.trim();
    const alreadyHeading = /^#{1,3}\s/.test(clean);
    payload.content = alreadyHeading ? clean : `# ${clean}`;
    payload.allowed_mentions = { parse: [] };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook error: ${response.status}`);
  }

  return true;
}
