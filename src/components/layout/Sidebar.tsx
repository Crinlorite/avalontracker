"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import CreateClanModal from "@/components/clan/CreateClanModal";

interface Clan {
  id: string;
  name: string;
  role: string;
}

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [clans, setClans] = useState<Clan[]>([]);
  const [showCreateClan, setShowCreateClan] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetchClans();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function fetchClans() {
    try {
      const res = await fetch("/api/clans");
      if (res.ok) {
        const data = await res.json();
        setClans(data);
      }
    } catch {
      /* empty */
    }
  }

  const user = session?.user;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gray-900 border-r border-gray-800">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/20 text-lg">
          A
        </div>
        <span className="text-lg font-bold text-white">Avalon Tracker</span>
      </div>

      {/* User info */}
      {user && (
        <div className="border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-3">
            {user.image && (
              <img
                src={user.image}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.displayName || user.name || "Aventurero"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname === "/dashboard"
                ? "bg-indigo-600/20 text-indigo-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </Link>

          <Link
            href="/profile"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname === "/profile"
                ? "bg-indigo-600/20 text-indigo-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Perfil
          </Link>

          {user?.isSuperAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === "/admin"
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin
            </Link>
          )}
        </div>

        {/* Clans */}
        <div className="mt-6">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Clanes
            </span>
            <button
              onClick={() => setShowCreateClan(true)}
              className="text-gray-500 transition-colors hover:text-indigo-400"
              title="Crear clan"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="space-y-1">
            {clans.map((clan) => {
              const isActive = pathname.startsWith(`/clan/${clan.id}`);
              return (
                <Link
                  key={clan.id}
                  href={`/clan/${clan.id}`}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-400"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-800 text-xs font-bold text-gray-400">
                    {clan.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{clan.name}</span>
                </Link>
              );
            })}

            {clans.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-600">
                Sin clanes
              </p>
            )}
          </div>
        </div>
      </nav>

      {/* Sign out */}
      <div className="border-t border-gray-800 px-3 py-3">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
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

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-gray-900 p-2 text-gray-400 shadow-lg md:hidden"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 md:block">
        {sidebarContent}
      </aside>
    </>
  );
}
