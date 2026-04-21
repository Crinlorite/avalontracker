export function AdminCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-white">{value}</div>
    </div>
  );
}
