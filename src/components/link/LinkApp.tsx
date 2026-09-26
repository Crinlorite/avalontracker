"use client";
import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { keepMapsWithDiscord } from "@/components/map/guest-actions";

export function LinkApp({ state, code }: { state: "signin" | "guest" | "ready"; code?: string }) {
  const { t } = useLanguage();
  const deepLink = code ? `avalontracker://linked?code=${encodeURIComponent(code)}` : null;
  useEffect(() => { if (deepLink) window.location.href = deepLink; }, [deepLink]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <h1 className="text-2xl font-bold text-white">{t("link.title")}</h1>
        {state === "signin" && (<>
          <p className="mt-3 text-slate-300">{t("link.needDiscord")}</p>
          <button onClick={() => signIn("discord", { callbackUrl: "/link/app" })} className="mt-5 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white hover:bg-[#4752c4]">{t("landing.cta.signin")}</button>
        </>)}
        {state === "guest" && (<>
          <p className="mt-3 text-slate-300">{t("link.guest")}</p>
          <button onClick={() => keepMapsWithDiscord("/link/app")} className="mt-5 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white hover:bg-[#4752c4]">{t("guest.banner.cta")}</button>
        </>)}
        {state === "ready" && deepLink && code && (<>
          <p className="mt-3 text-slate-300">{t("link.ready")}</p>
          <a href={deepLink} className="mt-5 inline-block rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500">{t("link.open")}</a>
          <button onClick={() => navigator.clipboard.writeText(code)} className="mt-3 block w-full text-xs text-slate-400 hover:text-white">{t("link.copy")}</button>
          <code className="mt-2 block break-all text-[10px] text-slate-500">{code}</code>
        </>)}
      </div>
    </main>
  );
}
