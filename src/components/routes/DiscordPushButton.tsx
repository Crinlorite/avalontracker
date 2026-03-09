"use client";

import { useState } from "react";

interface DiscordPushButtonProps {
  clanId: string;
  routeId: string;
}

export default function DiscordPushButton({
  clanId,
  routeId,
}: DiscordPushButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handlePush() {
    setLoading(true);
    setStatus("idle");

    try {
      const res = await fetch(`/api/clans/${clanId}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId }),
      });

      if (res.ok) {
        setStatus("success");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handlePush}
      disabled={loading}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        status === "success"
          ? "bg-green-900/50 text-green-300"
          : status === "error"
            ? "bg-red-900/50 text-red-300"
            : "bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/50"
      } disabled:opacity-50`}
      title="Enviar a Discord"
    >
      {loading ? (
        <span className="flex items-center gap-1">
          <div className="h-3 w-3 animate-spin rounded-full border border-indigo-300 border-t-transparent" />
          Enviando
        </span>
      ) : status === "success" ? (
        "Enviado!"
      ) : status === "error" ? (
        "Error"
      ) : (
        "Discord"
      )}
    </button>
  );
}
