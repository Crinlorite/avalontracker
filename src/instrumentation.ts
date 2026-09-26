// Tareas de fondo del servidor Next (standalone). Solo en el runtime Node.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { purgeIdleGuests } = await import("@/lib/guest");
  const { logger } = await import("@/lib/logger");
  const run = async () => {
    try {
      const n = await purgeIdleGuests();
      if (n) logger.info({ n }, "idle guest accounts purged");
    } catch (err) {
      logger.warn({ err }, "guest purge failed");
    }
  };
  // Una vez al arrancar (con margen) y luego cada 6 h.
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
