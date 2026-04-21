import useSWR from "swr";

export type ClanDetail = {
  id: string; name: string; discordGuildId: string; discordGuildName: string; discordGuildIcon: string | null;
  discordWebhookUrl: string | null; anchorZoneId: number | null; botInstalled: boolean;
  _count?: { members: number; routes: number };
};

export function useClan(clanId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ClanDetail>(clanId ? `/api/clans/${clanId}` : null);
  return { clan: data, error, isLoading, mutate };
}
