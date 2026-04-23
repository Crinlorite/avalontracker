"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import { useMyClans } from "@/hooks/useMyClans";
import { roleLabel, roleBadgeColor } from "@/lib/role-ui";
import { CreateClanModal } from "@/components/clan/CreateClanModal";

export default function DashboardPage() {
  const { me } = useMe();
  const { clans, mutate } = useMyClans();
  const [showCreate, setShowCreate] = useState(false);
  // El botón de crear clan está restringido hasta que Vigil Bot exponga la
  // verificación de permisos Discord del owner/admin del guild. Mientras
  // tanto solo el flag interno puede crear (fail-closed contra squatting).
  const canCreateClan = me?.tier === "alpha";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Hola, {me?.displayName ?? me?.globalNickname ?? me?.discordUsername ?? "Usuario"}</h1>
        <p className="text-sm text-slate-400">Elige un clan para ver sus rutas.</p>
      </header>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Mis clanes</h2>
          {canCreateClan && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >+ Nuevo clan</button>
          )}
        </div>

        {clans.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
            Todavía no estás en ningún clan. Si tu clan ya está dado de alta y has iniciado sesión con Discord, asegúrate de tener un rol mapeado.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clans.map((c) => (
              <Link key={c.id} href={`/clan/${c.id}`} className="group rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-indigo-700">
                <div className="mb-3 flex items-center gap-3">
                  {c.discordGuildIcon ? (
                    <Image src={`https://cdn.discordapp.com/icons/${c.discordGuildId}/${c.discordGuildIcon}.png`} alt="" width={40} height={40} className="rounded" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-indigo-700 text-center text-xl leading-10">🛡️</div>
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.discordGuildName}</div>
                  </div>
                </div>
                <div className={`inline-block rounded px-2 py-0.5 text-xs ${roleBadgeColor(c.myRole)}`}>{roleLabel(c.myRole)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showCreate && <CreateClanModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); mutate(); }} />}
    </div>
  );
}
