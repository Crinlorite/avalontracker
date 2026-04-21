"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import useSWR from "swr";
import { roleLabel, roleBadgeColor } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type ClanEntry = { id: string; name: string; discordGuildIcon: string | null; myRole: AppRole | null };

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: clans = [] } = useSWR<ClanEntry[]>("/api/me/clans");

  const avatar = session?.user?.image;
  const name = session?.user?.name ?? "Usuario";
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;

  return (
    <>
      <button
        className="fixed left-3 top-3 z-50 rounded-md border border-slate-700 bg-slate-900 p-2 text-white md:hidden"
        onClick={() => setOpen(!open)}
        aria-label="Menú"
      >☰</button>

      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed z-40 flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform md:translate-x-0`}>
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xl">🌀</span>
          <span className="font-bold text-white">Avalon Tracker</span>
        </div>

        {session?.user && (
          <div className="mb-6 flex items-center gap-3 rounded-lg bg-slate-900 p-3">
            {avatar ? (
              <Image src={avatar} alt="" width={36} height={36} className="rounded-full" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-indigo-700" />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="truncate text-sm font-medium text-white">{name}</div>
              {isSuperAdmin && (
                <div className="mt-0.5 inline-block rounded bg-yellow-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Super Admin</div>
              )}
            </div>
          </div>
        )}

        <nav className="mb-6 flex flex-col gap-1">
          <Link href="/dashboard" className={navClass(pathname === "/dashboard")}>Dashboard</Link>
          <Link href="/profile" className={navClass(pathname === "/profile")}>Perfil</Link>
          {isSuperAdmin && <Link href="/admin" className={navClass(pathname.startsWith("/admin"))}>Admin Global</Link>}
        </nav>

        <div className="mb-2 text-xs uppercase text-slate-500">Mis clanes</div>
        <div className="mb-6 flex flex-1 flex-col gap-1 overflow-y-auto">
          {clans.map((c) => (
            <Link key={c.id} href={`/clan/${c.id}`} className={navClass(pathname.startsWith(`/clan/${c.id}`))}>
              <span className="truncate">{c.name}</span>
              {c.myRole && (
                <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] ${roleBadgeColor(c.myRole)}`}>
                  {roleLabel(c.myRole)}
                </span>
              )}
            </Link>
          ))}
          {clans.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">Sin clanes todavía</div>}
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >Cerrar sesión</button>
      </aside>
    </>
  );
}

function navClass(active: boolean): string {
  return `flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-900"}`;
}
