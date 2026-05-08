import useSWR from "swr";
import { useVisibilityPolling } from "./useVisibilityPolling";

export type HopStatus = "ACTIVE" | "EXPIRED" | "COLLAPSED" | "WATCHED";
export type RouteStatusFilter = "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL";

export type HopView = {
  id: number; order: number; portalSize: number; expiresAt: string;
  status: HopStatus; statusNote: string | null;
  fromZone: { id: number; name: string; type: string; tier: number | null; isRest: boolean; hasHideout: boolean };
  toZone:   { id: number; name: string; type: string; tier: number | null; isRest: boolean; hasHideout: boolean };
};
export type RouteView = {
  id: string; clanId: string; status: "ACTIVE" | "EXPIRED" | "DISABLED"; version: number;
  notes: string | null; updatedAt: string; createdAt: string;
  createdBy: { id: string; discordUsername: string; displayName: string | null; globalNickname: string | null; discordAvatar: string | null };
  hops: HopView[];
};
export type RoutesResponse = { routes: RouteView[]; now: string };

export function useClanRoutes(clanId: string | undefined, filter: RouteStatusFilter = "ACTIVE") {
  const refreshMs = useVisibilityPolling();
  const url = clanId ? `/api/clans/${clanId}/routes?status=${filter}` : null;
  const { data, error, isLoading, mutate } = useSWR<RoutesResponse>(url, {
    refreshInterval: refreshMs,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  return { routes: data?.routes ?? [], now: data?.now, error, isLoading, mutate };
}
