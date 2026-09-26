"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { useMe } from "@/hooks/useMe";
import { useMyClans } from "@/hooks/useMyClans";
import { roleLabel, roleBadgeColor } from "@/lib/role-ui";
import { CreateClanModal } from "@/components/clan/CreateClanModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { keepMapsWithDiscord } from "@/components/map/guest-actions";

export default function DashboardPage() {
  const { me } = useMe();
  const { clans, mutate } = useMyClans();
  const [showCreate, setShowCreate] = useState(false);
  const { t } = useLanguage();

  const isGuest = me?.isGuest === true;
  const name = isGuest
    ? t("guest.name")
    : (me?.displayName ?? me?.globalNickname ?? me?.discordUsername ?? t("dashboard.greetingFallback"));

  const maps = clans.filter((c) => c.kind === "PERSONAL");
  const guilds = clans.filter((c) => c.kind !== "PERSONAL");

  return (
    <div className="space-y-8">
      <PageHeader>
        <h1 className="text-3xl font-bold text-white">{t("dashboard.greeting", { name })}</h1>
        <p className="text-sm text-slate-400">{t("dashboard.subtitle")}</p>
      </PageHeader>

      {isGuest && (
        <section className="flex flex-col gap-3 rounded-xl border border-[#5865F2]/50 bg-[#5865F2]/10 p-5 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="font-semibold text-white">{t("guest.banner.title")}</h2>
            <p className="mt-1 text-sm text-slate-300">{t("guest.banner.body")}</p>
          </div>
          <button
            onClick={() => keepMapsWithDiscord("/dashboard")}
            className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4]"
          >{t("guest.banner.cta")}</button>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{t("dashboard.myMaps")}</h2>
          <Link href="/map?new=1" className="rounded-md border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/20">
            {t("dashboard.newMap")}
          </Link>
        </div>
        {maps.length === 0 ? (
          <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">{t("dashboard.maps.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {maps.map((c) => (
              <Link key={c.id} href={`/clan/${c.id}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-indigo-700">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-slate-800 text-center text-xl leading-10">🗺️</div>
                  <div className="flex-1 font-semibold text-white">{c.name}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!isGuest && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">{t("dashboard.guildMaps")}</h2>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >{t("dashboard.newClan")}</button>
          </div>

          {guilds.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-300">
              <h3 className="text-base font-semibold text-white">{t("dashboard.empty.title")}</h3>
              <p className="mt-2 text-slate-400">{withVigil(t("dashboard.empty.why"))}</p>
              <ul className="mt-3 space-y-1.5">
                <li>• {t("dashboard.empty.member")}</li>
                <li>• {t("dashboard.empty.admin")}</li>
              </ul>
              <p className="mt-4 border-t border-slate-800 pt-3">
                <Link href="/map?new=1" className="text-indigo-300 hover:text-indigo-200">{t("dashboard.empty.personal")}</Link>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guilds.map((c) => (
                <Link key={c.id} href={`/clan/${c.id}`} className="group rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-indigo-700">
                  <div className="mb-3 flex items-center gap-3">
                    {c.discordGuildIcon && c.discordGuildId ? (
                      <Image src={`https://cdn.discordapp.com/icons/${c.discordGuildId}/${c.discordGuildIcon}.png`} alt="" width={40} height={40} className="rounded" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-indigo-700 text-center text-xl leading-10">🛡️</div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-white">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.discordGuildName}</div>
                    </div>
                  </div>
                  <div className={`inline-block rounded px-2 py-0.5 text-xs ${roleBadgeColor(c.myRole)}`}>{roleLabel(c.myRole, t)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {showCreate && <CreateClanModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); mutate(); }} />}
    </div>
  );
}

function withVigil(text: string): ReactNode {
  const [a, b] = text.split("{vigil}");
  return (
    <>
      {a}
      <a href="https://vigilbot.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-400 hover:underline">Vigil Bot</a>
      {b}
    </>
  );
}
