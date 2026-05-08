import useSWR from "swr";

type ZoneRef = { zone: { id: number; name: string; type: string; tier: number | null }; hops: number };
export type ZoneRouting = {
  nearestRoyal:   ZoneRef | null;
  nearestRest:    ZoneRef | null;
  nearestCapital: ZoneRef | null;
  computedAt?: string;
};

export function useZoneRouting(zoneId: number | null) {
  const { data, isLoading } = useSWR<ZoneRouting>(zoneId ? `/api/zones/${zoneId}/routing` : null, {
    revalidateOnFocus: false,
  });
  return { routing: data, isLoading };
}
