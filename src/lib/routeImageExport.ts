import { toBlob } from "html-to-image";

// Captura un nodo DOM como PNG y lo copia al clipboard del usuario
// (para pegar en Discord/Slack con Ctrl+V) o lo descarga como archivo
// si la API de clipboard no está disponible.
//
// Patrón heredado de Royal Forge (buildPngExport.js): pixelRatio 2 para
// que se vea nítido en retina/4K, backgroundColor para que el export no
// salga con píxeles transparentes, cacheBust para esquivar caches de SW
// que devuelven Responses sin CORS y dejan en blanco las imágenes.

const SAFE_FILENAME = /[\\/:*?"<>|\x00-\x1f]/g;

const TO_BLOB_OPTS = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: "#0f172a", // slate-900 — coincide con el chrome del card
  fetchRequestInit: { credentials: "omit" } as RequestInit,
};

function sanitizeFilename(name: string): string {
  return (name || "route").trim().replace(SAFE_FILENAME, "_").slice(0, 60) || "route";
}

function triggerDownloadFromUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Espera a que carguen las fonts del navegador y todas las <img> dentro
// del nodo. html-to-image inlina los imgs por URL pero si el elemento
// aún no se ha pintado del todo (mount muy reciente), el layout
// resultante es incorrecto al serializar.
async function waitForAssets(node: HTMLElement): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // font loading es best-effort
    }
  }
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return null;
      return new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        img.addEventListener("load", done);
        img.addEventListener("error", done);
        // Cap duro: si un icono está flaky no bloqueamos el export.
        setTimeout(done, 4000);
      });
    }),
  );
}

// Exportado para que el flujo de Discord-push pueda generar el blob,
// enviarlo al server vía multipart FormData, y que el server lo
// reenvíe al webhook de Discord como adjunto.
export async function captureNodeAsBlob(node: HTMLElement): Promise<Blob> {
  await waitForAssets(node);
  // Un frame extra para que cualquier reflow final se asiente.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  const blob = await toBlob(node, TO_BLOB_OPTS);
  if (!blob) throw new Error("html-to-image devolvió blob nulo");
  return blob;
}

function clipboardSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard?.write &&
    typeof window !== "undefined" &&
    typeof window.ClipboardItem === "function"
  );
}

// Intenta clipboard primero, fallback a download. La rama de clipboard
// pasa una Promise<Blob> dentro de ClipboardItem para que
// navigator.clipboard.write sea la primera llamada awaiteada tras el
// gesto del usuario — Safari lo exige para conceder permisos, Chrome y
// Firefox lo aceptan también.
//
// Devuelve "clipboard" | "download" para que el caller muestre el toast
// correcto.
export type ExportResult = "clipboard" | "download";

export async function copyOrDownloadNodeAsPng(
  node: HTMLElement,
  name: string,
): Promise<ExportResult> {
  if (clipboardSupported()) {
    try {
      const blobPromise = captureNodeAsBlob(node);
      await navigator.clipboard.write([
        new window.ClipboardItem({ "image/png": blobPromise }),
      ]);
      return "clipboard";
    } catch (err) {
      // Permission denied, write rechazado, blob falló — caen aquí.
      // Fallback a download silencioso.
      console.warn("clipboard write failed; falling back to download:", err);
    }
  }

  const blob = await captureNodeAsBlob(node);
  const url = URL.createObjectURL(blob);
  try {
    triggerDownloadFromUrl(url, `${sanitizeFilename(name)}.png`);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
  return "download";
}
