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
  route: RouteInfo
) {
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
