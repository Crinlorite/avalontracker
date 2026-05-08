"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { useMe } from "@/hooks/useMe";
import { useLanguage } from "@/contexts/LanguageContext";
import { canAdmin } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };
type Tab = { i18nKey: string; path: string; adminOnly?: boolean };

const TABS: Tab[] = [
  { i18nKey: "nav.routes",   path: "" },
  { i18nKey: "nav.members",  path: "/members" },
  { i18nKey: "nav.trash",    path: "/trash" },
  { i18nKey: "nav.settings", path: "/settings", adminOnly: true },
  { i18nKey: "nav.audit",    path: "/audit", adminOnly: true },
];

export default function ClanTabs({ clanId }: { clanId: string }) {
  const pathname = usePathname();
  const basePath = `/clan/${clanId}`;
  const { me } = useMe();
  const { t } = useLanguage();
  const { data: members = [] } = useSWR<MemberRow[]>(
    clanId ? `/api/clans/${clanId}/members` : null
  );

  const myRole = members.find((m) => m.userId === me?.id)?.appRole ?? null;
  const isAdmin = canAdmin(myRole);

  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <nav className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
      {visibleTabs.map((tab) => {
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
            {t(tab.i18nKey)}
          </Link>
        );
      })}
    </nav>
  );
}
