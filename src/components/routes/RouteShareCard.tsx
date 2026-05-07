"use client";
import { forwardRef } from "react";
import type { RouteView } from "@/hooks/useClanRoutes";
import { nodeColorForZoneType } from "@/components/graph/graph-colors";
import { colorForMinutes, minutesLeft } from "@/lib/time";

// Tarjeta visual de una ruta para exportar como imagen al compartir en
// Discord. Diseñada para capturar con html-to-image: ancho fijo, sin
// dependencias de scroll/animaciones, fonts del sistema o Inter
// (cargada por el layout raíz). Inline styles para evitar que un CSS
// no resuelto al momento de captura deje el card sin estilo.
//
// Tiempos: usamos hora absoluta en UTC (== Albion Time). El countdown
// relativo se vuelve obsoleto en cuanto la imagen llega al canal —
// con UTC todo el clan, esté en Madrid o en LA, ve la misma hora de
// cierre y la traduce a su huso local. El footer lo aclara.

const CARD_WIDTH = 520;
const NODE_WIDTH = 380;
const WEEKDAY_UTC = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
});
const WEEKDAY_LOCAL = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function portalLabel(size: number): string {
  if (size === 7) return "7p";
  if (size === 20) return "20p";
  if (size === 40) return "40p (Tentáculo)";
  return `${size}p`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Cierre en UTC (Albion Time). Day prefix solo si cae en otro día UTC.
function formatUtcClose(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const today = new Date().toISOString().slice(0, 10);
  const closeDay = d.toISOString().slice(0, 10);
  if (closeDay !== today) return `${WEEKDAY_UTC.format(d)} ${hh}:${mm}`;
  return `${hh}:${mm}`;
}

// Cierre en zona horaria del navegador. Day prefix solo si cae en
// otro día local (puede no coincidir con el day-shift en UTC, son
// husos distintos).
function formatLocalClose(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const today = new Date().toDateString();
  const closeDay = d.toDateString();
  if (closeDay !== today) return `${WEEKDAY_LOCAL.format(d)} ${hh}:${mm}`;
  return `${hh}:${mm}`;
}

// Abreviatura del huso local (CEST, EST, etc) extraída del Intl.
// Fallback a "Local" si el navegador no expone el shortname.
function getLocalTzAbbr(): string {
  try {
    const parts = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(new Date());
    const part = parts.find((p) => p.type === "timeZoneName");
    if (part?.value) return part.value;
  } catch {
    // ignore
  }
  return "Local";
}

// Offset de UTC en formato "UTC+H" o "UTC-H[:MM]".
function formatUtcOffset(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  if (offsetMin === 0) return "UTC+0";
  const sign = offsetMin > 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${pad2(m)}`;
}

// Detección de DST. Comparamos el offset de Enero vs Julio del año
// actual; el huso "estándar" es el offset MAYOR (más negativo en
// JavaScript, que devuelve -120 para UTC+2 etc). Si el offset actual
// es menor (= clocks adelantados) entonces DST está activo. Si Enero
// y Julio coinciden, este huso no usa DST en absoluto.
function detectDstStatus(): "on" | "off" | "n/a" {
  const year = new Date().getFullYear();
  const janOffset = new Date(year, 0, 1).getTimezoneOffset();
  const julOffset = new Date(year, 6, 1).getTimezoneOffset();
  if (janOffset === julOffset) return "n/a";
  const stdOffset = Math.max(janOffset, julOffset);
  const currentOffset = new Date().getTimezoneOffset();
  return currentOffset < stdOffset ? "on" : "off";
}

// Etiqueta completa del huso local con DST si aplica:
//   "CEST · UTC+2 · DST activo"
//   "CET · UTC+1 · DST inactivo"
//   "JST · UTC+9"   (sin mención de DST porque Japón no lo usa)
function formatLocalTzFull(): string {
  const abbr = getLocalTzAbbr();
  const offset = formatUtcOffset();
  const dst = detectDstStatus();
  if (dst === "n/a") return `${abbr} · ${offset}`;
  return `${abbr} · ${offset} · DST ${dst === "on" ? "activo" : "inactivo"}`;
}

export const RouteShareCard = forwardRef<HTMLDivElement, { route: RouteView }>(
  function RouteShareCard({ route }, ref) {
    if (!route.hops.length) return null;

    // Construimos la cadena de zonas: la primera fromZone, y luego
    // todas las toZone. Aristas y portal sizes intercalados.
    const firstFrom = route.hops[0].fromZone;

    // Metadata de huso horario una vez. Se pasa a HopArrow para evitar
    // recalcular el offset por cada hop.
    const offsetMin = -new Date().getTimezoneOffset();
    const isAlbionTime = offsetMin === 0;
    const localTzFull = formatLocalTzFull();

    const now = new Date().toLocaleString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div
        ref={ref}
        style={{
          width: CARD_WIDTH,
          padding: "20px 24px 16px",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily:
            "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          borderRadius: 12,
          border: "1px solid #1e293b",
          boxSizing: "border-box",
        }}
      >
        {/* Header con branding marca: logo box con gradient + título grande
            + tagline en uppercase, tipo Royal Forge. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            paddingBottom: 14,
            borderBottom: "1px solid #1e293b",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
              flexShrink: 0,
            }}
          >
            🗺️
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "-0.02em",
              }}
            >
              Avalon Tracker
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#94a3b8",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 3,
              }}
            >
              by Crintech Studios
            </span>
          </div>
        </div>

        {/* Cadena de zonas */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <ZoneBox
            name={firstFrom.name}
            type={firstFrom.type}
            tier={firstFrom.tier}
            hasHideout={firstFrom.hasHideout}
            isRest={firstFrom.isRest}
          />
          {route.hops.map((hop, i) => (
            <div
              key={hop.id}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}
            >
              <HopArrow
                portalSize={hop.portalSize}
                expiresAt={hop.expiresAt}
                status={hop.status}
                showLocalAndUtc={!isAlbionTime}
              />
              <ZoneBox
                name={hop.toZone.name}
                type={hop.toZone.type}
                tier={hop.toZone.tier}
                hasHideout={hop.toZone.hasHideout}
                isRest={hop.toZone.isRest}
                isLast={i === route.hops.length - 1}
              />
            </div>
          ))}
        </div>

        {/* Footer: declara los dos husos horarios. La hora "local" del
            sharer queda explícita con su offset y estado de DST para
            que cualquier viewer en cualquier huso sepa traducir sin
            ambigüedad. El timestamp de captura va en hora local. */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 10,
            borderTop: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 10,
            color: "#64748b",
          }}
        >
          {!isAlbionTime && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Local:</span>{" "}
                <span>{localTzFull}</span>
              </span>
              <span>
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>🕐 Albion Time</span>{" "}
                <span>· UTC+0</span>
              </span>
            </div>
          )}
          {isAlbionTime && (
            <div>
              <span style={{ color: "#fbbf24", fontWeight: 700 }}>🕐 Albion Time</span>{" "}
              <span>· UTC+0 (capturada en este mismo huso)</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>avalon.crintech.pro</span>
            <span>capturada {now}</span>
          </div>
        </div>
      </div>
    );
  },
);

function ZoneBox({
  name,
  type,
  tier,
  hasHideout,
  isRest,
  isLast,
}: {
  name: string;
  type: string;
  tier: number | null;
  hasHideout: boolean;
  isRest: boolean;
  isLast?: boolean;
}) {
  const borderColor = nodeColorForZoneType(type);
  // Trunca IDs largos (Mists) para no romper el ancho fijo.
  const displayName = name.length > 30 ? name.slice(0, 28) + "…" : name;
  return (
    <div
      style={{
        width: NODE_WIDTH,
        padding: "10px 12px",
        background: "#0b1220",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        boxSizing: "border-box",
        marginBottom: isLast ? 0 : 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#fff",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {displayName}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        {tier != null && <Pill bg="#334155">T{tier}</Pill>}
        {hasHideout && <Pill bg="#a16207">HO</Pill>}
        {isRest && <Pill bg="#15803d">Rest</Pill>}
      </div>
    </div>
  );
}

function Pill({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        fontSize: 9,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}

function HopArrow({
  portalSize,
  expiresAt,
  status,
  showLocalAndUtc,
}: {
  portalSize: number;
  expiresAt: string;
  status: string;
  showLocalAndUtc: boolean;
}) {
  const mins = minutesLeft(expiresAt);
  const timerColor =
    status === "EXPIRED" ? "#3b82f6" :
    status === "COLLAPSED" ? "#6b7280" :
    status === "WATCHED" ? "#fbbf24" :
    colorForMinutes(mins);
  const closeUtc = formatUtcClose(expiresAt);
  const closeLocal = formatLocalClose(expiresAt);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "6px 0",
      }}
    >
      <div style={{ width: 2, height: 14, background: timerColor }} />
      <div
        style={{
          background: "#1e293b",
          border: `1px solid ${timerColor}`,
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 11,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: timerColor,
          margin: "1px 0",
        }}
      >
        <span style={{ color: "#94a3b8", marginRight: 4 }}>cierra</span>
        {showLocalAndUtc ? (
          <>
            <span style={{ fontWeight: 700 }}>{closeLocal}</span>
            <span style={{ color: "#64748b", margin: "0 6px", fontSize: 10 }}>
              ({closeUtc} UTC)
            </span>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 700 }}>{closeUtc}</span>
            <span style={{ color: "#94a3b8", marginLeft: 3 }}>UTC</span>
          </>
        )}
        <span style={{ color: "#64748b", margin: "0 4px" }}>·</span>
        <span style={{ color: "#cbd5e1" }}>{portalLabel(portalSize)}</span>
        {status === "COLLAPSED" && <span style={{ marginLeft: 4 }}>✕</span>}
        {status === "WATCHED" && <span style={{ marginLeft: 4 }}>👁</span>}
      </div>
      <div style={{ width: 2, height: 14, background: timerColor }} />
    </div>
  );
}
