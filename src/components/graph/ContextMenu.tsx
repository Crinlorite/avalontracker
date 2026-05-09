"use client";
import { useEffect, useRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuOption = {
  icon?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
};

// Popover contextual para click derecho. Se posiciona en (x, y) absoluto
// del viewport via portal a document.body, así escapa de containing
// blocks (overflow:hidden de ReactFlow, transforms del viewport, etc.).
//
// UX:
// - Click en una opción → ejecuta y cierra
// - Click fuera del menú → cierra
// - ESC → cierra
// - Si el menú se sale del viewport (cursor en el borde derecho/abajo),
//   se reposiciona al cuadrante opuesto.
export function ContextMenu({
  x,
  y,
  options,
  onClose,
}: {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Empezamos invisible para evitar flash mientras medimos posición.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Si el menú se sale por la derecha → ábrelo a la izquierda del cursor.
    const left = x + rect.width > vw ? Math.max(8, x - rect.width) : x;
    // Si se sale por abajo → ábrelo hacia arriba.
    const top = y + rect.height > vh ? Math.max(8, y - rect.height) : y;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // mousedown (no click) para que se cierre en cuanto el user pulse
    // fuera, no al levantar el botón. Más responsive.
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-[60] min-w-[220px] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-2xl"
    >
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={opt.disabled}
          onClick={() => {
            if (opt.disabled) return;
            opt.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            opt.variant === "danger"
              ? "text-red-300 hover:bg-red-950/50"
              : "text-slate-200 hover:bg-slate-800"
          }`}
        >
          {opt.icon && <span aria-hidden className="w-4 text-center">{opt.icon}</span>}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
