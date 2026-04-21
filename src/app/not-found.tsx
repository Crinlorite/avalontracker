import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="space-y-4 text-center">
        <h1 className="text-5xl font-bold text-white">404</h1>
        <p className="text-slate-400">Esta ruta no existe.</p>
        <Link href="/dashboard" className="inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Ir al dashboard</Link>
      </div>
    </div>
  );
}
