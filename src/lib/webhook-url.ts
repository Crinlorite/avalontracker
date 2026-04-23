// Validación de webhook URLs de Discord para evitar SSRF.
// Discord webhook URLs tienen el formato:
//   https://discord.com/api/webhooks/<id>/<token>
//   https://discordapp.com/api/webhooks/<id>/<token>     (legacy)
//   https://canary.discord.com/api/webhooks/<id>/<token> (canary, raro)
//   https://ptb.discord.com/api/webhooks/<id>/<token>    (ptb, raro)
// Cualquier URL que no encaje en este patrón se rechaza para no permitir
// que un clan admin convierta el endpoint discord-push o webhook-test en
// un escáner de la red interna del VPS.
const ALLOWED_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
]);

export function isDiscordWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!ALLOWED_HOSTS.has(url.hostname)) return false;
  if (!url.pathname.startsWith("/api/webhooks/")) return false;
  return true;
}
