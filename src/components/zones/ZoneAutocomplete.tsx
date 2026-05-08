"use client";
import { useRef, useState, useEffect } from "react";
import { useZoneSearch, type ZoneSuggestion } from "@/hooks/useZoneSearch";
import { ZoneBadges } from "./ZoneBadges";

export function ZoneAutocomplete({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setInput(value), [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { suggestions } = useZoneSearch(input, open && input.length > 0);

  function select(s: ZoneSuggestion) {
    setInput(s.name);
    onChange(s.name);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={input}
        disabled={disabled}
        placeholder={placeholder ?? "Zona…"}
        onChange={(e) => { setInput(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(suggestions.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter" && suggestions[hi]) { e.preventDefault(); select(suggestions[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => select(s)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === hi ? "bg-indigo-800" : "hover:bg-slate-800"}`}
            >
              <span className="text-white">{s.name}</span>
              <ZoneBadges zone={s} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
