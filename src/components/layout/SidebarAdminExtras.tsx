"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Badge + enlace de gestión. Chunk separado con dynamic() — usuarios sin
// el flag interno no descargan este código.
export function SidebarAdminBadge() {
  return (
    <div className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-yellow-600 text-xs font-bold leading-none text-white">
      α
    </div>
  );
}

export function SidebarAdminLink() {
  const pathname = usePathname();
  const active = pathname.startsWith("/admin");
  return (
    <Link
      href="/admin"
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
        active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-900"
      }`}
    >
      Panel
    </Link>
  );
}
