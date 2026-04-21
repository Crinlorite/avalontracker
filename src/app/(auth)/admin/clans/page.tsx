"use client";
import useSWR from "swr";
import Link from "next/link";

type AdminClan = {
  id: string; name: string; discordGuildName: string; createdAt: string; botInstalled: boolean;
  _count: { members: number; routes: number };
};

export default function AdminClansPage() {
  const { data = [] } = useSWR<AdminClan[]>("/api/admin/clans");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Clanes ({data.length})</h1>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Nombre</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Guild</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Miembros</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Rutas</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Bot</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2"><Link href={`/clan/${c.id}`} className="text-indigo-400 hover:text-indigo-300">{c.name}</Link></td>
                <td className="px-3 py-2 text-slate-300">{c.discordGuildName}</td>
                <td className="px-3 py-2 text-slate-300">{c._count.members}</td>
                <td className="px-3 py-2 text-slate-300">{c._count.routes}</td>
                <td className="px-3 py-2">{c.botInstalled ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
