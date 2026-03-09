"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const tabs = [
  { label: "Rutas", path: "" },
  { label: "Miembros", path: "/members" },
  { label: "Configuración", path: "/settings" },
  { label: "Auditoría", path: "/audit" },
];

export default function ClanTabs({ clanId }: { clanId: string }) {
  const pathname = usePathname();
  const basePath = `/clan/${clanId}`;

  return (
    <nav className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
      {tabs.map((tab) => {
        const href = `${basePath}${tab.path}`;
        const isActive =
          tab.path === ""
            ? pathname === basePath
            : pathname.startsWith(href);

        return (
          <Link
            key={tab.path}
            href={href}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
