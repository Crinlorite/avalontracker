import { isDiscordWebhookUrl } from "@/lib/webhook-url";

// Discord limita los attachments por mensaje a 25 MB en el plan free.
// Una PNG generada por nuestro share-card pesa < 200 KB típicamente,
// así que 8 MB es un cap conservador que evita abuso sin recortar uso
// legítimo.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

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

  // Link a la web al final del embed: el usuario quiere que cada
  // mensaje promocione Avalon Tracker para nuevos miembros del clan.
  // Discord renderiza `[texto](url)` como link subrayado nativo.
  const embed = {
    title: `🗺️ ${title}`,
    url: "https://avalon.crintech.pro",
    color,
    fields,
    description: "🔗 [Consultar grafo y rutas completas](https://avalon.crintech.pro)",
    footer: {
      text: `Avalon Tracker · by Crintech Studios · ${route.hops.length} ${route.hops.length === 1 ? "puerta" : "puertas"}`,
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

// Envía un segundo mensaje al mismo webhook con la imagen como adjunto,
// sin contenido extra. Discord espera multipart/form-data con un
// `payload_json` (puede ser vacío) y `files[N]` para el archivo.
// allowed_mentions.parse=[] previene cualquier ping si el filename
// contuviera @here u otros patrones (defensa en profundidad).
export async function sendImageToDiscord(
  webhookUrl: string,
  imageBytes: ArrayBuffer | Uint8Array,
  filename = "route.png",
): Promise<true> {
  if (!isDiscordWebhookUrl(webhookUrl)) {
    throw new Error("Webhook URL no válida (debe ser de discord.com)");
  }
  const bytes = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Imagen demasiado grande (${bytes.byteLength} bytes, max ${MAX_ATTACHMENT_BYTES})`);
  }

  const fd = new FormData();
  fd.set("payload_json", JSON.stringify({ allowed_mentions: { parse: [] } }));
  // Blob desde Uint8Array para que FormData ponga Content-Type correcto.
  fd.set("files[0]", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename);

  const response = await fetch(webhookUrl, { method: "POST", body: fd });
  if (!response.ok) {
    throw new Error(`Discord webhook image error: ${response.status}`);
  }
  return true;
}
