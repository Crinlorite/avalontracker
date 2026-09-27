// Tareas de fondo del servidor Next (standalone). Solo en el runtime Node.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { purgeIdleGuests } = await import("@/lib/guest");
  const { refreshPricesJob } = await import("@/lib/market-prices");
  const { sweepTrash } = await import("@/lib/trash");
  const { logger } = await import("@/lib/logger");
  const guests = async () => {
    try {
      const n = await purgeIdleGuests();
      if (n) logger.info({ n }, "idle guest accounts purged");
    } catch (err) {
      logger.warn({ err }, "guest purge failed");
    }
  };
  // Una vez al arrancar (con margen) y luego cada 6 h.
  setTimeout(guests, 60_000).unref();
  setInterval(guests, 6 * 60 * 60 * 1000).unref();

  // Papelera (7 días) de todos los mapas, también los que solo usa la app:
  // a los 90 s de arrancar y luego cada hora.
  const trash = async () => {
    try {
      const n = await sweepTrash();
      if (n.hops || n.routes) logger.info(n, "trash swept");
    } catch (err) {
      logger.warn({ err }, "trash sweep failed");
    }
  };
  setTimeout(trash, 90_000).unref();
  setInterval(trash, 60 * 60 * 1000).unref();

  // Precios AODP: a los 30 s de arrancar y luego cada hora (spec §7).
  // AODP_DISABLED=1 apaga la tarea (desarrollo sin red o self-host sin precios).
  if (process.env.AODP_DISABLED !== "1") {
    const prices = () => refreshPricesJob().catch((err) => logger.warn({ err }, "aodp prices refresh failed"));
    setTimeout(prices, 30_000).unref();
    setInterval(prices, 60 * 60 * 1000).unref();
  }
}
