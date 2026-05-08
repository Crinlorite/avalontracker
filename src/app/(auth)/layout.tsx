import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";

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
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto md:ml-64">
        {/* pt-16 en mobile: deja sitio para el botón hamburguer
            (fixed top-3 left-3, ~52px de alto). En md+ no hay
            hamburguer (sidebar siempre visible) así que pt vuelve
            a 8 (32px). */}
        <div className="px-4 pb-4 pt-16 md:p-8">{children}</div>
        <footer className="border-t border-slate-800/60 px-4 py-6 text-center text-xs text-slate-500">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
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
          <p className="mt-2">Avalon Tracker · by Crintech Studios</p>
        </footer>
      </main>
    </div>
  );
}
