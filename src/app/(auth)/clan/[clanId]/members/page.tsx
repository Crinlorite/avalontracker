"use client";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { useMe } from "@/hooks/useMe";
import { useClan } from "@/hooks/useClan";
import { roleLabel, roleBadgeColor, canAdmin } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = {
  id: number; userId: string; appRole: AppRole | null; roleSource: string | null; lastSyncAt: string | null; joinedAt: string;
  user: { id: string; discordUsername: string; globalNickname: string | null; displayName: string | null; avatarUrl: string };
};

export default function MembersPage() {
  const { clanId } = useParams() as { clanId: string };
  const { data: members = [], mutate } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const { me } = useMe();
  const myMember = members.find((m) => m.userId === me?.id);
  const amAdmin = canAdmin(myMember?.appRole ?? null);
  const [editing, setEditing] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  async function saveOverride(memberId: number) {
    const val = newName.trim() || null;
    const res = await fetch(`/api/clans/${clanId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: val }),
    });
    if (res.ok) { toast.success("Guardado"); setEditing(null); mutate(); }
    else toast.error("Error");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Miembros ({members.length})</h1>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Usuario</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Rol</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Entró</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Último sync</th>
              {amAdmin && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="flex items-center gap-3 px-3 py-2">
                  <Image src={m.user.avatarUrl} alt="" width={32} height={32} className="rounded-full" />

                  <div>
                    <div className="font-medium text-white">
                      {m.user.displayName ?? m.user.globalNickname ?? m.user.discordUsername}
                    </div>
                    <div className="text-xs text-slate-500">@{m.user.discordUsername}</div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${roleBadgeColor(m.appRole)}`}>{roleLabel(m.appRole)}</span>
                </td>
                <td className="px-3 py-2 text-slate-400">{new Date(m.joinedAt).toLocaleDateString("es-ES")}</td>
                <td className="px-3 py-2 text-slate-500">{m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString("es-ES") : "—"}</td>
                {amAdmin && (
                  <td className="px-3 py-2 text-right">
                    {/* displayName es campo global del User — por privacy fix
                        solo el propio user puede editarlo. Admin del clan NO
                        puede renombrar a otros. */}
                    {m.userId === me?.id ? (
                      editing === m.id ? (
                        <span className="flex gap-1">
                          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" maxLength={40} className="w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
                          <button onClick={() => saveOverride(m.id)} className="rounded bg-green-600 px-2 py-1 text-xs text-white">OK</button>
                          <button onClick={() => setEditing(null)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">X</button>
                        </span>
                      ) : (
                        <button onClick={() => { setEditing(m.id); setNewName(m.user.displayName ?? ""); }} className="text-xs text-indigo-400 hover:text-indigo-300">
                          Renombrar
                        </button>
                      )
                    ) : null}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
