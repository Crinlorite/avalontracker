"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function ClanSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const clanId = params.clanId as string;
  const { data: session } = useSession();
  const [clanName, setClanName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [myRole, setMyRole] = useState<string>("MEMBER");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function fetchClan() {
      try {
        const res = await fetch(`/api/clans/${clanId}`);
        if (res.ok) {
          const data = await res.json();
          setClanName(data.name);
          setWebhookUrl(data.discordWebhookUrl || "");
        }
      } catch {
        /* empty */
      }
    }

    async function fetchRole() {
      try {
        const res = await fetch(`/api/clans/${clanId}/members`);
        if (res.ok) {
          const members = await res.json();
          const me = members.find(
            (m: { userId: string }) => m.userId === session?.user?.id
          );
          if (me) setMyRole(me.role);
        }
      } catch {
        /* empty */
      }
    }

    fetchClan();
    if (session?.user?.id) fetchRole();
  }, [clanId, session?.user?.id]);

  const isOwner = myRole === "OWNER";
  const isOfficerPlus = myRole === "OWNER" || myRole === "OFFICER";

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clanName }),
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Nombre del clan actualizado",
        });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Error al guardar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setSavingWebhook(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordWebhookUrl: webhookUrl }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Webhook actualizado" });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Error al guardar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleTestWebhook() {
    setTestingWebhook(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/clans/${clanId}/webhook/test`, {
        method: "POST",
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Mensaje de prueba enviado a Discord",
        });
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "Error al enviar prueba",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setTestingWebhook(false);
    }
  }

  async function handleDeleteClan() {
    if (
      !confirm(
        "¿Estás seguro de eliminar este clan? Esta acción no se puede deshacer."
      )
    )
      return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        alert(data.error || "Error al eliminar");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setDeleting(false);
    }
  }

  if (!isOfficerPlus) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400">
          No tienes permisos para acceder a la configuración del clan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Configuración</h2>

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

      {isOwner && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-white">
            Nombre del clan
          </h3>
          <form onSubmit={handleSaveName} className="flex gap-3">
            <input
              type="text"
              value={clanName}
              onChange={(e) => setClanName(e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={savingName}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {savingName ? "Guardando..." : "Guardar"}
            </button>
          </form>
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold text-white">
          Webhook de Discord
        </h3>
        <form onSubmit={handleSaveWebhook} className="space-y-3">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={savingWebhook}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {savingWebhook ? "Guardando..." : "Guardar webhook"}
            </button>
            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={testingWebhook || !webhookUrl}
              className="rounded-lg bg-gray-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
            >
              {testingWebhook ? "Enviando..." : "Probar"}
            </button>
          </div>
        </form>
      </div>

      {isOwner && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 shadow-lg">
          <h3 className="mb-2 text-lg font-semibold text-red-400">
            Zona de peligro
          </h3>
          <p className="mb-4 text-sm text-gray-400">
            Eliminar el clan borrará todas las rutas, miembros y configuraciones
            de forma permanente.
          </p>
          <button
            onClick={handleDeleteClan}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {deleting ? "Eliminando..." : "Eliminar clan"}
          </button>
        </div>
      )}
    </div>
  );
}
