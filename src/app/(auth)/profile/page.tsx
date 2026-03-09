"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [displayName, setDisplayName] = useState(
    session?.user?.displayName || ""
  );
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      if (res.ok) {
        await update();
        setMessage({
          type: "success",
          text: "Nombre actualizado correctamente",
        });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Error al guardar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateCode() {
    setGenerating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile/code", { method: "POST" });

      if (res.ok) {
        await update();
        setMessage({
          type: "success",
          text: "Código personal generado correctamente",
        });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Error al generar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setGenerating(false);
    }
  }

  function copyCode() {
    if (session?.user?.personalCode) {
      navigator.clipboard.writeText(session.user.personalCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  if (!session?.user) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold text-white">Perfil</h1>

      {message && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === "success"
              ? "border-green-600/30 bg-green-900/20 text-green-300"
              : "border-red-600/30 bg-red-900/20 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Cuenta de Google
        </h2>
        <div className="flex items-center gap-4">
          {session.user.image && (
            <img
              src={session.user.image}
              alt="Avatar"
              className="h-14 w-14 rounded-full"
            />
          )}
          <div>
            <p className="font-medium text-white">{session.user.name}</p>
            <p className="text-sm text-gray-400">{session.user.email}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Nombre en el juego
        </h2>
        <form onSubmit={handleSaveDisplayName} className="flex gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Tu nombre en Albion Online"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Código personal de invitación
        </h2>
        {session.user.personalCode ? (
          <div className="flex items-center gap-3">
            <code className="rounded-md bg-gray-800 px-4 py-2 text-lg font-mono text-indigo-400">
              {session.user.personalCode}
            </code>
            <button
              onClick={copyCode}
              className="rounded-md bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
            >
              {codeCopied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-gray-400">
              Genera un código personal para que otros puedan unirse a tus
              clanes.
            </p>
            <button
              onClick={handleGenerateCode}
              disabled={generating}
              className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {generating ? "Generando..." : "Generar código"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
