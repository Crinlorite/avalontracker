import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// La navegación entre tabs del clan (Rutas / Miembros / Papelera /
// Configuración / Auditoría) vive en el sidebar, expandiendo el
// clan activo. Antes había una fila de tabs encima del contenido
// que duplicaba la info; eliminada para dar más espacio al grafo
// y simplificar la jerarquía visual.
export default async function ClanLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ clanId: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <div className="space-y-6">{children}</div>;
}
