// Marca de Avalon Tracker: el logo «el portal» (public/icon.svg, esquinas ya redondeadas).
// <img> a propósito: SVG estático, sin optimizar; html-to-image lo incrusta al exportar tarjetas.
/* eslint-disable @next/next/no-img-element */
export function BrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return <img src="/icon.svg" alt="" aria-hidden width={size} height={size} className={`inline-block shrink-0 ${className}`} />;
}
