interface RouteInfo {
  entryZone: string;
  exitZone: string;
  portalSize: number;
  expiresAt: string;
  createdBy: string;
  status: string;
}

export async function sendRouteToDiscord(
  webhookUrl: string,
  route: RouteInfo
) {
  const expiresDate = new Date(route.expiresAt);
  const discordTimestamp = Math.floor(expiresDate.getTime() / 1000);

  const color =
    route.status === "ACTIVE"
      ? 0x22c55e // verde
      : route.status === "DISABLED"
        ? 0xef4444 // rojo
        : 0x6b7280; // gris

  const embed = {
    title: `🗺️ ${route.entryZone} → ${route.exitZone}`,
    color,
    fields: [
      {
        name: "Portal",
        value: `${route.portalSize} personas`,
        inline: true,
      },
      {
        name: "Estado",
        value: route.status,
        inline: true,
      },
      {
        name: "Expira",
        value: `<t:${discordTimestamp}:R>`,
        inline: true,
      },
      {
        name: "Registrado por",
        value: route.createdBy,
        inline: true,
      },
    ],
    footer: {
      text: "Avalon Tracker",
    },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook error: ${response.status}`);
  }

  return true;
}
