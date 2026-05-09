import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarToggleProvider } from "@/components/layout/SidebarToggleContext";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <SidebarToggleProvider>
      {/*
        Layout cambiado a flex-column con altura atada al viewport
        (`h-dvh`): main es flex-col donde el contenedor de children
        ocupa flex-1 con su propio scroll, y el footer queda anclado
        al fondo (shrink-0) sin tener que scrollear hasta él. Para
        pages cortas (como dashboard o el grafo del clan) todo es
        visible: header → contenido → footer en una sola pantalla.
        Pages largas (audit log, etc) scrollean dentro del flex-1
        sin desplazar el footer.
      */}
      <div className="flex h-dvh bg-gray-950">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden md:ml-64">
          {/*
            children container es flex-col para que pages que necesiten
            ocupar TODA la altura (grafo del clan) puedan usar `flex-1`
            en su wrapper en lugar de `h-full` (este último requiere
            parent con altura explícita y rompe en cadenas largas de
            flex). Pages "planas" (dashboard, perfil, etc.) renderizan
            stacked top-down y, si exceden el viewport, scrollean
            dentro de este overflow-y-auto.
          */}
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-8">{children}</div>
          <footer className="shrink-0 border-t border-slate-800/60 px-4 py-3 text-center text-xs text-slate-500 md:py-6">
            <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 md:gap-x-4 md:gap-y-2">
              <a href="/feedback" className="hover:text-slate-300">📝 Feedback</a>
              <span aria-hidden className="text-slate-700">·</span>
              <a href="https://royalforge.crintech.pro" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">
                🛡️ Royal Forge
              </a>
              <span aria-hidden className="text-slate-700">·</span>
              <a href="/legal/aviso-legal" className="hover:text-slate-300">Aviso legal</a>
              <span aria-hidden className="text-slate-700">·</span>
              <a href="/legal/privacy" className="hover:text-slate-300">Privacidad</a>
            </nav>
            <p className="mt-1.5 text-sm font-semibold text-slate-300 md:mt-3 md:text-base">
              Avalon Tracker
              <span className="font-normal text-slate-500"> · by </span>
              <a
                href="https://crintech.pro"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-indigo-400 underline-offset-2 hover:underline"
              >
                Crintech Studios
              </a>
            </p>
          </footer>
        </main>
      </div>
    </SidebarToggleProvider>
  );
}
