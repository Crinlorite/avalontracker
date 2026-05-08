"use client";
import { type ReactNode } from "react";
import { HamburgerButton } from "@/components/layout/SidebarToggleContext";

// Header standard de página: HamburgerButton inline (mobile-only)
// + el contenido del header (típicamente h1 + subtítulo). Ahorra
// repetir el wrap flex+gap en cada página y asegura que mobile
// siempre tiene acceso al sidebar sin reservar una fila propia.
export function PageHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="pt-1">
          <HamburgerButton />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}
