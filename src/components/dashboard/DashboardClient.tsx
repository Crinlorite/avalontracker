"use client";

import { useState, useEffect } from "react";
import CreateClanModal from "@/components/clan/CreateClanModal";

interface Clan {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

interface UserData {
  id: string;
  name?: string | null;
  displayName?: string | null;
  personalCode?: string | null;
  image?: string | null;
  isSuperAdmin?: boolean;
}

export default function DashboardClient({ user }: { user: UserData }) {
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateClan, setShowCreateClan] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    fetchClans();
  }, []);

  async function fetchClans() {
    try {
      const res = await fetch("/api/clans");
      if (res.ok) {
        const data = await res.json();
        setClans(data);
      }
    } catch {
      console.error("Error al cargar clanes");
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    if (user.personalCode) {
      navigator.clipboard.writeText(user.personalCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  const roleLabels: Record<string, string> = {
    OWNER: "Lider",
    OFFICER: "Oficial",
    MEMBER: "Miembro",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Bienvenido, {user.displayName || user.name || "Aventurero"}
        </h1>
        {!user.displayName && (
          <div className="mt-3 rounded-lg border border-yellow-600/30 bg-yellow-900/20 p-4">
            <p className="text-sm text-yellow-300">
              No tienes nombre de juego configurado.{" "}
              <a href="/profile" className="font-medium underline hover:text-yellow-200">
                Configúralo en tu perfil
              </a>
            </p>
          </div>
        )}
      </div>

      {user.personalCode && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-2 text-sm font-medium text-gray-400">
            Tu código personal de invitación
          </h2>
          <div className="flex items-center gap-3">
            <code className="rounded-md bg-gray-800 px-4 py-2 text-lg font-mono text-indigo-400">
              {user.personalCode}
            </code>
            <button
              onClick={copyCode}
              className="rounded-md bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
            >
              {codeCopied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Tus Clanes</h2>
          <button
            onClick={() => setShowCreateClan(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            + Crear Clan
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : clans.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-gray-400">
              No perteneces a ningún clan todavía.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Crea uno nuevo o pide una invitación.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {clans.map((clan) => (
              <a
                key={clan.id}
                href={`/clan/${clan.id}`}
                className="group rounded-lg border border-gray-800 bg-gray-900 p-5 shadow-lg transition-all hover:border-indigo-600/50 hover:shadow-indigo-600/10"
              >
                <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400">
                  {clan.name}
                </h3>
                <span className="mt-1 inline-block rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                  {roleLabels[clan.role] || clan.role}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {showCreateClan && (
        <CreateClanModal
          onClose={() => setShowCreateClan(false)}
          onCreated={() => {
            setShowCreateClan(false);
            fetchClans();
          }}
        />
      )}
    </div>
  );
}
