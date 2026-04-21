"use client";
import useSWR from "swr";
import { useState } from "react";
import { formatCountdown, secondsLeft, colorForMinutes, minutesLeft } from "@/lib/time";

type AdminRoute = {
  id: string; status: string; updatedAt: string;
  clan: { id: string; name: string };
  hops: Array<{ portalSize: number; expiresAt: string; fromZone: { name: string }; toZone: { name: string } }>;
  createdBy: { discordUsername: string; displayName: string | null };
};

export default function AdminRoutesPage() {
  const [status, setStatus] = useState("ACTIVE");
  const [zone, setZone] = useState("");
  const { data } = useSWR<{ data: AdminRoute[]; pagination: { total: number } }>(`/api/admin/routes?status=${status}&zone=${encodeURIComponent(zone)}&limit=100`);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Rutas cross-clan</h1>

      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white">
          {["ACTIVE", "EXPIRED", "DISABLED", "ALL"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input placeholder="Zona (exact)" value={zone} onChange={(e) => setZone(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
        <a href="/api/admin/routes/export.csv" className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">Export CSV</a>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Clan</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Cadena</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creador</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Próximo exp.</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data?.data.map((r) => {
              const next = r.hops.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
              const mins = next ? minutesLeft(next.expiresAt) : -1;
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-white">{r.clan.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">
                    {r.hops.map((h, i) => <span key={i}>{i === 0 && h.fromZone.name}<span className="text-slate-500"> → </span>{h.toZone.name} </span>)}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{r.createdBy.displayName ?? r.createdBy.discordUsername}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: colorForMinutes(mins) }}>{next ? formatCountdown(secondsLeft(next.expiresAt)) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">Total: {data?.pagination.total ?? 0}</div>
    </div>
  );
}
