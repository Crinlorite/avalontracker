"use client";
import toast from "react-hot-toast";

// Botón para limpiar entradas de rastro del propietario en la auditoría.
// Se carga via dynamic() con ssr:false desde la página de audit, condicionado
// a que el user cumpla la condición — usuarios normales no cargan este chunk.
export function AuditCleanupButton({
  clanId,
  onDone,
}: {
  clanId: string;
  onDone: () => void;
}) {
  async function cleanup() {
    if (!confirm("¿Limpiar entradas antiguas del propietario en este clan? (irreversible)")) return;
    const res = await fetch(`/api/clans/${clanId}/audit?purge=all-super-admin`, { method: "DELETE" });
    if (res.ok) {
      const body = await res.json();
      toast.success(`Limpiadas ${body.deleted} entradas`);
      onDone();
    } else {
      toast.error("Error al limpiar");
    }
  }

  return (
    <button
      onClick={cleanup}
      className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
      title="Limpiar entradas antiguas del propietario en este clan"
    >
      🗑 Limpiar entradas antiguas
    </button>
  );
}
