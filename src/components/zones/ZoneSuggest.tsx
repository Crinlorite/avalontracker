"use client";
import { useId, useMemo, useState } from "react";
import { suggestZones } from "@/lib/zone-suggest";

// Campo de búsqueda de zonas con sugerencias a partir de 3 letras.
// Enter elige la primera sugerencia; Escape cierra la lista.
export function ZoneSuggest({ value, onChange, onPick, names, placeholder, autoFocus, name, className }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (zoneName: string) => void;
  names: readonly string[];
  placeholder: string;
  autoFocus?: boolean;
  name?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const suggestions = useMemo(() => suggestZones(value, names), [value, names]);
  const show = open && suggestions.length > 0;
  return (
    <div className="relative">
      <input
        type="search"
        name={name}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={show}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && show) { e.preventDefault(); onPick(suggestions[0]); setOpen(false); }
        }}
        className={className ?? "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"}
      />
      {show && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {suggestions.map((n, i) => (
            <li key={n} role="option" aria-selected={i === 0}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(n); setOpen(false); }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-800 ${i === 0 ? "text-white" : "text-slate-200"}`}>
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
