"use client";
import Link from "next/link";
import useSWR from "swr";
import { AdminCard } from "@/components/admin/AdminCard";

type Overview = { clans: number; activeRoutes: number; usersActive24h: number; expiringSoon: number };

export default function AdminPage() {
  const { data } = useSWR<Overview>("/api/admin/overview");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Admin Global</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <AdminCard label="Clanes" value={data?.clans ?? "—"} />
        <AdminCard label="Rutas activas" value={data?.activeRoutes ?? "—"} />
        <AdminCard label="Users 24h" value={data?.usersActive24h ?? "—"} />
        <AdminCard label="Expiran <30m" value={data?.expiringSoon ?? "—"} />
      </div>

      <nav className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Link href="/admin/map" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Mapa global</Link>
        <Link href="/admin/routes" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Rutas cross-clan</Link>
        <Link href="/admin/clans" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Clanes</Link>
        <Link href="/admin/users" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Users</Link>
        <Link href="/admin/ingest-tokens" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Ingest tokens</Link>
      </nav>
    </div>
  );
}
