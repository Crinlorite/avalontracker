"use client";
import useSWR from "swr";

type Health = { db: boolean; vigilBot: boolean };

// Fetcher custom porque /api/health devuelve 503 cuando db está caída
// (con el body { db: false, ... }) y el fetcher global del SWRProvider
// throw-ea en non-2xx. Aquí queremos parsear el cuerpo aunque sea 503
// para poder mostrar el banner correcto.
async function healthFetcher(url: string): Promise<Health | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 429) return null; // rate-limited: tratamos como "ok" silencioso
    return (await res.json()) as Health;
  } catch {
    // Red caída del cliente — no mostramos banner (no podríamos confirmar)
    return null;
  }
}

// Banner global que polea /api/health cada 30s y alerta cuando Vigil
// Bot está caído. Sin él, la app sigue parcialmente funcional (read +
// writes con rol cached <24h via fix de permissions.ts) pero los
// cambios de rol Discord NO se propagan, role mappings nuevos no se
// pueden validar, y los webhooks (push a Discord) fallan. El usuario
// debe saberlo a primera vista, no descubrirlo por síntomas.
//
// Visualmente: cuando todo OK, no mostramos nada (cero ruido). Cuando
// vigilBot=false aparece banner naranja sticky en top-right. db=false
// es más grave (nada funciona) → banner rojo con mensaje distinto.
//
// Polling 30s: balance entre detectar rápido (problemas operativos
// requieren acción manual) y no pegar al endpoint. /api/health tiene
// rate-limit 60/min per IP, varios usuarios desde misma IP NAT no
// chocarían.
export function VigilHealthBanner() {
  const { data } = useSWR<Health | null>("/api/health", healthFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  if (!data) return null;
  if (data.db && data.vigilBot) return null;

  const dbDown = !data.db;
  const message = dbDown
    ? "Base de datos no disponible — la app no puede leer ni escribir. Reintenta en unos minutos."
    : "Vigil Bot offline — los cambios de roles de Discord no se sincronizan, push a Discord deshabilitado. La app sigue funcional con roles cacheados.";
  const tone = dbDown
    ? "border-red-700 bg-red-950/95 text-red-100"
    : "border-amber-700 bg-amber-950/95 text-amber-100";

  return (
    <div
      role="alert"
      className={`fixed inset-x-0 top-0 z-[60] border-b px-4 py-2 text-center text-sm shadow-lg backdrop-blur ${tone}`}
    >
      <span aria-hidden className="mr-2">⚠</span>
      {message}
    </div>
  );
}
