"use client";
import { useState } from "react";
import useSWR from "swr";

type UserRow = { id: string; discordId: string; discordUsername: string; displayName: string | null; email: string; createdAt: string };

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const { data = [] } = useSWR<UserRow[]>(`/api/admin/users?q=${encodeURIComponent(q)}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Users</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por username/email" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900"><tr><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Discord</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Email</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creado</th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {data.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 text-white">{u.displayName ?? u.discordUsername} <span className="font-mono text-xs text-slate-500">({u.discordId})</span></td>
                <td className="px-3 py-2 text-slate-400">{u.email}</td>
                <td className="px-3 py-2 text-slate-500">{new Date(u.createdAt).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
