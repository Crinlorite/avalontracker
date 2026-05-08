"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="max-w-md space-y-4 rounded-xl border border-red-900 bg-red-950/30 p-6 text-center">
        <h2 className="text-xl font-bold text-white">Algo se rompió</h2>
        <p className="text-sm text-red-300">{error.message}</p>
        {error.digest && <div className="font-mono text-xs text-red-500">digest: {error.digest}</div>}
        <button onClick={reset} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
      </div>
    </div>
  );
}
