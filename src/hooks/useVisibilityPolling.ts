import { useEffect, useState } from "react";

export function useVisibilityPolling(visibleMs = 12_000, backgroundMs = 60_000): number {
  const [ms, setMs] = useState<number>(typeof document !== "undefined" && document.visibilityState === "visible" ? visibleMs : backgroundMs);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => setMs(document.visibilityState === "visible" ? visibleMs : backgroundMs);
    document.addEventListener("visibilitychange", handler);
    handler();
    return () => document.removeEventListener("visibilitychange", handler);
  }, [visibleMs, backgroundMs]);

  return ms;
}
