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

const CARD_WIDTH = 480;
const NODE_WIDTH = 360;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
});

function portalLabel(size: number): string {
  if (size === 7) return "7p";
  if (size === 20) return "20p";
  if (size === 40) return "40p (Tentáculo)";
  return `${size}p`;
}

// Formato de cierre absoluto en UTC (Albion Time). Si el cierre cae en
// otro día UTC distinto al actual, prefijamos el día de la semana
// (Mon/Tue/...) para evitar ambigüedad — un timer de 24h podría caer
// en mañana sin que se note de un vistazo.
function formatUtcClose(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const today = new Date().toISOString().slice(0, 10);
  const closeDay = d.toISOString().slice(0, 10);
  if (closeDay !== today) {
    return `${WEEKDAY_FORMATTER.format(d)} ${hh}:${mm}`;
  }
  return `${hh}:${mm}`;
}

export const RouteShareCard = forwardRef<HTMLDivElement, { route: RouteView }>(
  function RouteShareCard({ route }, ref) {
    if (!route.hops.length) return null;

    // Construimos la cadena de zonas: la primera fromZone, y luego
    // todas las toZone. Aristas y portal sizes intercalados.
    const firstFrom = route.hops[0].fromZone;

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

        {/* Footer: aclara que las horas son Albion Time (UTC+0) — sin
            esto, alguien en otro huso podría confundir el cierre con
            su hora local. La fecha de captura va en su zona local. */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 10,
            borderTop: "1px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10,
            color: "#64748b",
            gap: 8,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>🕐 Albion Time</span>
            <span>· UTC+0</span>
          </span>
          <span>avalon.crintech.pro · {now}</span>
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
}: {
  portalSize: number;
  expiresAt: string;
  status: string;
}) {
  const mins = minutesLeft(expiresAt);
  const timerColor =
    status === "EXPIRED" ? "#3b82f6" :
    status === "COLLAPSED" ? "#6b7280" :
    status === "WATCHED" ? "#fbbf24" :
    colorForMinutes(mins);
  // Hora absoluta de cierre en UTC (Albion Time). Inmune al envejecer
  // de la imagen — todo el clan ve la misma hora se vea cuando se vea.
  const closeUtc = formatUtcClose(expiresAt);

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
        <span style={{ fontWeight: 700 }}>{closeUtc}</span>
        <span style={{ color: "#64748b", margin: "0 4px" }}>·</span>
        <span style={{ color: "#cbd5e1" }}>{portalLabel(portalSize)}</span>
        {status === "COLLAPSED" && <span style={{ marginLeft: 4 }}>✕</span>}
        {status === "WATCHED" && <span style={{ marginLeft: 4 }}>👁</span>}
      </div>
      <div style={{ width: 2, height: 14, background: timerColor }} />
    </div>
  );
}
