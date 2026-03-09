"use client";

import { useState, useEffect, useRef } from "react";

interface Zone {
  id: number;
  name: string;
  type: string;
  tier?: number | null;
  resources?: unknown;
  chests?: unknown;
}

interface ZoneAutocompleteProps {
  value: string;
  onChange: (zoneName: string) => void;
  placeholder?: string;
}

const TYPE_COLORS: Record<string, string> = {
  AVALON: "bg-violet-900/50 text-violet-300",
  ROYAL: "bg-blue-900/50 text-blue-300",
  OUTLANDS: "bg-red-900/50 text-red-300",
};

const TYPE_LABELS: Record<string, string> = {
  AVALON: "Avalon",
  ROYAL: "Royal",
  OUTLANDS: "Outlands",
};

export default function ZoneAutocomplete({
  value,
  onChange,
  placeholder = "Buscar zona...",
}: ZoneAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Zone[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(val: string) {
    setQuery(val);
    onChange(val);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (val.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/zones?q=${encodeURIComponent(val.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(data.length > 0);
        }
      } catch {
        /* empty */
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(zone: Zone) {
    setQuery(zone.name);
    onChange(zone.name);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {loading && (
        <div className="absolute right-3 top-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
          {results.map((zone) => (
            <button
              key={zone.id}
              onClick={() => handleSelect(zone)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-gray-700"
            >
              <span className="flex-1 font-medium">{zone.name}</span>
              {zone.tier && (
                <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
                  T{zone.tier}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  TYPE_COLORS[zone.type] || "bg-gray-700 text-gray-300"
                }`}
              >
                {TYPE_LABELS[zone.type] || zone.type}
              </span>
              {zone.resources ? (
                <span className="text-xs text-gray-500" title="Recursos">
                  R
                </span>
              ) : null}
              {zone.chests ? (
                <span className="text-xs text-yellow-600" title="Cofres">
                  C
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
