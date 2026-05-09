import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarToggleProvider } from "@/components/layout/SidebarToggleContext";
import { VigilHealthBanner } from "@/components/layout/VigilHealthBanner";

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
      <VigilHealthBanner />
      <div className="flex min-h-screen bg-gray-950">
        <Sidebar />
        <main className="flex-1 overflow-y-auto md:ml-64">
          {/* p-4 en mobile (sin pt extra — ya no hay botón fixed,
              el hamburger lo renderiza cada página inline en su
              header junto a ViewToggle/etc). */}
          <div className="p-4 md:p-8">{children}</div>
        <footer className="border-t border-slate-800/60 px-4 py-6 text-center text-xs text-slate-500">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <a href="/feedback" className="hover:text-slate-300">📝 Feedback</a>
            <span aria-hidden className="text-slate-700">·</span>
            <a href="https://royalforge.app" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">
              🛡️ Royal Forge
            </a>
            <span aria-hidden className="text-slate-700">·</span>
            <a href="/legal/aviso-legal" className="hover:text-slate-300">Aviso legal</a>
            <span aria-hidden className="text-slate-700">·</span>
            <a href="/legal/privacy" className="hover:text-slate-300">Privacidad</a>
          </nav>
            <p className="mt-3 text-base font-semibold text-slate-300">
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
