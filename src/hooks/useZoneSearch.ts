import useSWR from "swr";
import { useEffect, useState } from "react";

export type ZoneSuggestion = {
  id: number; name: string; type: "AVALON" | "ROYAL" | "OUTLANDS"; tier: number | null;
  hasHideout: boolean; isRest: boolean; isCapital: boolean;
};

export function useZoneSearch(query: string, enabled = true) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const url = enabled && debounced.length > 0 ? `/api/zones?q=${encodeURIComponent(debounced)}` : null;
  const { data = [], isLoading } = useSWR<ZoneSuggestion[]>(url, { revalidateOnFocus: false });
  return { suggestions: data, isLoading };
}
