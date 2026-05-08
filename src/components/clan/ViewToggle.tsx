"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ViewToggle({ clanId }: { clanId: string }) {
  const pathname = usePathname();
  const basePath = `/clan/${clanId}`;
  const isList = pathname.endsWith("/list");

  return (
    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
      {/* Compacto en mobile: solo emoji. En desktop emoji + texto. */}
      <Link
        href={basePath}
        title="Grafo"
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          !isList
            ? "bg-indigo-600 text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <span aria-hidden>🕸</span>
        <span className="ml-1.5 hidden md:inline">Grafo</span>
      </Link>
      <Link
        href={`${basePath}/list`}
        title="Lista"
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          isList
            ? "bg-indigo-600 text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <span aria-hidden>📋</span>
        <span className="ml-1.5 hidden md:inline">Lista</span>
      </Link>
    </div>
  );
}
