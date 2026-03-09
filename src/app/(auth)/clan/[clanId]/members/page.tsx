"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CLAN_ROLES_DISPLAY } from "@/lib/constants";

interface Member {
  id: number;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    displayName?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

interface Membership {
  role: string;
}

export default function MembersPage() {
  const params = useParams();
  const clanId = params.clanId as string;
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [myRole, setMyRole] = useState<string>("MEMBER");

  useEffect(() => {
    fetchMembers();
  }, [clanId]);

  async function fetchMembers() {
    try {
      const res = await fetch(`/api/clans/${clanId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
        const me = data.find(
          (m: Member) => m.userId === session?.user?.id
        );
        if (me) setMyRole(me.role);
      }
    } catch {
      console.error("Error al cargar miembros");
    } finally {
      setLoading(false);
    }
  }

  const isOfficerPlus = myRole === "OWNER" || myRole === "OFFICER";

  async function handleApproveCode(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setProcessing(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/clans/${clanId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Miembro agregado correctamente" });
        setInviteCode("");
        fetchMembers();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Error al procesar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setProcessing(false);
    }
  }

  async function handleKick(memberId: number) {
    if (!confirm("¿Estás seguro de expulsar a este miembro?")) return;

    try {
      const res = await fetch(
        `/api/clans/${clanId}/members/${memberId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchMembers();
      } else {
        const data = await res.json();
        alert(data.error || "Error al expulsar");
      }
    } catch {
      alert("Error de conexión");
    }
  }

  async function handleRoleChange(memberId: number, newRole: string) {
    try {
      const res = await fetch(
        `/api/clans/${clanId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (res.ok) {
        fetchMembers();
      } else {
        const data = await res.json();
        alert(data.error || "Error al cambiar rol");
      }
    } catch {
      alert("Error de conexión");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Miembros</h2>

      {message && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === "success"
              ? "border-green-600/30 bg-green-900/20 text-green-300"
              : "border-red-600/30 bg-red-900/20 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {isOfficerPlus && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 shadow-lg">
          <h3 className="mb-3 text-sm font-medium text-gray-400">
            Aprobar código de invitación
          </h3>
          <form onSubmit={handleApproveCode} className="flex gap-3">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Código personal del jugador"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={processing}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {processing ? "Procesando..." : "Aprobar"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Jugador
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Rol
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Desde
                </th>
                {isOfficerPlus && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-400">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="bg-gray-950 hover:bg-gray-900/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {member.user.image && (
                        <img
                          src={member.user.image}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      )}
                      <span className="font-medium text-white">
                        {member.user.displayName || member.user.name || "Sin nombre"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {myRole === "OWNER" && member.role !== "OWNER" ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value)
                        }
                        className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="OFFICER">Oficial</option>
                        <option value="MEMBER">Miembro</option>
                      </select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(member.joinedAt).toLocaleDateString("es-ES")}
                  </td>
                  {isOfficerPlus && (
                    <td className="px-4 py-3 text-right">
                      {member.role !== "OWNER" &&
                        member.userId !== session?.user?.id && (
                          <button
                            onClick={() => handleKick(member.id)}
                            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-red-900/50 hover:text-red-300"
                          >
                            Expulsar
                          </button>
                        )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    OWNER: "bg-yellow-900/50 text-yellow-300",
    OFFICER: "bg-indigo-900/50 text-indigo-300",
    MEMBER: "bg-gray-700/50 text-gray-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[role] || "bg-gray-700 text-gray-300"
      }`}
    >
      {CLAN_ROLES_DISPLAY[role] || role}
    </span>
  );
}
