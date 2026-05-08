"use client";
import type { ReactNode } from "react";

// Helper de tipografía común para páginas legales. Evita dependencia del
// plugin @tailwindcss/typography manteniendo estilos consistentes entre
// las 3 páginas (privacy, cookies, aviso-legal).
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-slate-300 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-amber-400 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_a]:text-indigo-400 [&_a:hover]:underline [&_strong]:text-white [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:text-amber-300 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_p]:leading-relaxed">
      <header className="space-y-2 border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-bold text-white md:text-4xl">{title}</h1>
        <p className="text-xs text-slate-500">{updated}</p>
      </header>
      {children}
    </div>
  );
}
