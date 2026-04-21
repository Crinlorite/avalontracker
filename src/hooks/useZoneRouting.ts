import useSWR from "swr";

export type ZoneRouting = {
  nearestRoyal: { zone: { id: number; name: string; type: string; tier: number | null }; hops: number } | null;
  nearestRest:  { zone: { id: number; name: string; type: string; tier: number | null }; hops: number } | null;
  computedAt?: string;
};

export function useZoneRouting(zoneId: number | null) {
  const { data, isLoading } = useSWR<ZoneRouting>(zoneId ? `/api/zones/${zoneId}/routing` : null, {
    revalidateOnFocus: false,
  });
  return { routing: data, isLoading };
}
