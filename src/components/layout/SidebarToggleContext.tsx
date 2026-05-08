"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

// Contexto compartido entre el Sidebar (que pinta el aside + backdrop)
// y un HamburgerButton inline (que vive en el header de cada página).
// Antes el hamburger era fixed top-3 left-3 dentro del Sidebar y
// ocupaba una fila propia en mobile; ahora cualquier página puede
// renderizar el botón en su header (en línea con ViewToggle, etc) y
// la state vive aquí arriba para que el aside reaccione.

type Ctx = { open: boolean; setOpen: (v: boolean) => void };

const SidebarToggleContext = createContext<Ctx | null>(null);

export function SidebarToggleProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarToggleContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarToggleContext.Provider>
  );
}

export function useSidebarToggle(): Ctx {
  const ctx = useContext(SidebarToggleContext);
  if (!ctx) throw new Error("useSidebarToggle requires <SidebarToggleProvider>");
  return ctx;
}

// Botón hamburguer reutilizable que cualquier header puede colocar
// inline. Solo visible en mobile (md:hidden) — en desktop el sidebar
// siempre está abierto y no necesita botón.
export function HamburgerButton({ className = "" }: { className?: string }) {
  const { setOpen } = useSidebarToggle();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white hover:bg-slate-800 md:hidden ${className}`}
      aria-label="Menú"
    >
      ☰
    </button>
  );
}
