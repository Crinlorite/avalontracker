import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeRouteCode } from "@/lib/route-codec";
import { ImportRoute } from "@/components/share/ImportRoute";

export const metadata: Metadata = { title: "Shared route", robots: { index: false, follow: false } };

// Enlaces https://avalontracker.app/i/<código> que ya genera la app (spec §8).
export default async function ImportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const raw = decodeURIComponent(code);
  const decoded = decodeRouteCode(raw);
  if (!decoded.ok && decoded.reason !== "unsupported_version") notFound();
  const hops = decoded.ok ? decoded.route.hops.map((h) => ({ ...h, expiresAt: h.expiresAt.toISOString() })) : [];
  return <ImportRoute code={raw} notes={decoded.ok ? decoded.route.notes ?? null : null} hops={hops} unsupported={!decoded.ok} />;
}
