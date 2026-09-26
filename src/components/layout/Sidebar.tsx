"use client";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import useSWR from "swr";
import { roleLabel, roleBadgeColor, canAdmin } from "@/lib/role-ui";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSidebarToggle } from "@/components/layout/SidebarToggleContext";
import type { AppRole } from "@/generated/prisma/client";
import { keepMapsWithDiscord } from "@/components/map/guest-actions";

type ClanEntry = { id: string; name: string; kind: "DISCORD" | "PERSONAL"; discordGuildIcon: string | null; myRole: AppRole | null };

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  // State del open/close vive en SidebarToggleContext: el HamburgerButton
  // que cada página renderiza inline (junto al ViewToggle, etc) llama a
  // setOpen(true). Antes era fixed top-3 left-3 ocupando una fila propia
  // en mobile; ahora se ahorra esa fila.
  const { open, setOpen } = useSidebarToggle();
  const { data: clans = [] } = useSWR<ClanEntry[]>("/api/me/clans");
  const { t } = useLanguage();

  const avatar = session?.user?.image;
  const isGuest = session?.user?.isGuest === true;
  const name = isGuest ? t("guest.name") : (session?.user?.name ?? t("dashboard.greetingFallback"));

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      {/* inset-y-0 left-0: anclado explícito al borde izquierdo del
          viewport. Sin esto, en mobile el `fixed` sin posicion
          definida se quedaba en el natural-flow position y el bg
          se pintaba off-viewport — el contenido entraba con el
          transform pero el background no. */}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform md:translate-x-0`}>
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
            </div>
          </div>
        )}

        <nav className="mb-6 flex flex-col gap-1">
          <Link href="/dashboard" className={navClass(pathname === "/dashboard")}>{t("nav.dashboard")}</Link>
          <Link href="/profile" className={navClass(pathname === "/profile")}>{t("nav.profile")}</Link>
        </nav>

        <div className="mb-2 text-xs uppercase text-slate-500">{t("nav.mapsAndClans")}</div>
        <div className="mb-6 flex flex-1 flex-col gap-1 overflow-y-auto">
          {clans.map((c) => {
            const clanBase = `/clan/${c.id}`;
            // Activo = el usuario está en alguna ruta del clan, no
            // necesariamente el dashboard del clan en sí. Mostramos
            // sub-nav para que en mobile el burger sustituya a las
            // pestañas (Rutas/Miembros/Papelera/etc).
            const isClanActive = pathname.startsWith(clanBase);
            return (
              <div key={c.id}>
                <Link
                  href={clanBase}
                  className={navClass(isClanActive && pathname === clanBase)}
                  onClick={() => setOpen(false)}
                >
                  <span className="truncate">{c.name}</span>
                  {c.kind === "PERSONAL" ? (
                    <span className="ml-2 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{t("personal.badge")}</span>
                  ) : c.myRole && (
                    <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] ${roleBadgeColor(c.myRole)}`}>
                      {roleLabel(c.myRole, t)}
                    </span>
                  )}
                </Link>
                {isClanActive && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                    <SubNavLink href={clanBase} active={pathname === clanBase} onClick={() => setOpen(false)}>
                      {t("nav.routes")}
                    </SubNavLink>
                    {c.kind !== "PERSONAL" && (
                      <SubNavLink href={`${clanBase}/members`} active={pathname.startsWith(`${clanBase}/members`)} onClick={() => setOpen(false)}>
                        {t("nav.members")}
                      </SubNavLink>
                    )}
                    <SubNavLink href={`${clanBase}/trash`} active={pathname.startsWith(`${clanBase}/trash`)} onClick={() => setOpen(false)}>
                      {t("nav.trash")}
                    </SubNavLink>
                    {canAdmin(c.myRole) && (
                      <>
                        <SubNavLink href={`${clanBase}/settings`} active={pathname.startsWith(`${clanBase}/settings`)} onClick={() => setOpen(false)}>
                          {t("nav.settings")}
                        </SubNavLink>
                        <SubNavLink href={`${clanBase}/audit`} active={pathname.startsWith(`${clanBase}/audit`)} onClick={() => setOpen(false)}>
                          {t("nav.audit")}
                        </SubNavLink>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {clans.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">{t("nav.noClans")}</div>}
        </div>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Idioma · Language</span>
          {/* direction="up" porque el switcher está al pie del sidebar
              — abrir hacia abajo dejaría la lista fuera del viewport. */}
          <LanguageSwitcher direction="up" />
        </div>

        {isGuest && (
          <button
            onClick={() => keepMapsWithDiscord(pathname)}
            className="mb-2 rounded-md bg-[#5865F2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4752c4]"
          >{t("guest.banner.cta")}</button>
        )}
        <button
          onClick={() => {
            // Un invitado que cierra sesión pierde el acceso a sus mapas.
            if (isGuest && !window.confirm(t("guest.signout.confirm"))) return;
            signOut({ callbackUrl: "/" });
          }}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >{t("nav.signOut")}</button>
      </aside>
    </>
  );
}

function navClass(active: boolean): string {
  return `flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-900"}`;
}

// Sub-nav link bajo el clan activo: más compacto, indentado, sin
// border-i. Cierra el sidebar mobile al click para no tener que
// dar al backdrop después de navegar.
function SubNavLink({
  href, active, onClick, children,
}: { href: string; active: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block rounded-md px-2 py-1.5 text-xs transition ${
        active
          ? "bg-indigo-600/30 text-indigo-200"
          : "text-slate-400 hover:bg-slate-900 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
