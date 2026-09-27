"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

type Device = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

// Dispositivos vinculados (tokens de dispositivo) y QR de vínculo de 60 s
// (spec §5.2, flujo 1).
export function DevicesPanel() {
  const { t, lang } = useLanguage();
  const { data, mutate } = useSWR<{ devices: Device[] }>("/api/v1/devices");
  const [qr, setQr] = useState<{ code: string; dataUrl: string; expiresAt: number } | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!qr) return;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setQr(null);
    }, 500);
    return () => clearInterval(id);
  }, [qr]);

  async function link() {
    const r = await fetch("/api/v1/devices/link", { method: "POST" });
    if (!r.ok) { toast.error(t("toast.error")); return; }
    const { code, expiresAt } = await r.json();
    setQr({ code, dataUrl: await QRCode.toDataURL(code, { margin: 1, width: 240 }), expiresAt: new Date(expiresAt).getTime() });
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/v1/devices/${id}`, { method: "DELETE" });
    if (r.ok) mutate(); else toast.error(t("toast.error"));
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{t("devices.help")}</p>
      {qr ? (
        <div className="flex flex-col items-center gap-2 rounded border border-slate-800 bg-slate-950 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.dataUrl} alt="" width={240} height={240} className="rounded bg-white p-2" />
          <p className="text-sm text-slate-300">{t("devices.scan")} <span className="font-mono text-slate-500">{left}s</span></p>
          <button onClick={link} className="text-xs text-indigo-300 hover:text-indigo-200">{t("devices.newCode")}</button>
        </div>
      ) : (
        <button onClick={link} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">{t("devices.link")}</button>
      )}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {(data?.devices ?? []).length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("devices.empty")}</li>}
        {(data?.devices ?? []).map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="text-white">{d.name}</span>
            <span className="text-xs text-slate-500">{d.lastUsedAt ? t("devices.lastUsed", { date: fmt(d.lastUsedAt) }) : t("devices.never")}</span>
            <button onClick={() => revoke(d.id)} className="ml-auto text-xs text-red-300 hover:text-red-200">{t("devices.revoke")}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
