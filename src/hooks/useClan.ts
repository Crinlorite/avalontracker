import useSWR from "swr";

export type ClanAnchorZone = {
  id: number;
  name: string;
  type: "AVALON" | "ROYAL" | "OUTLANDS";
  tier: number | null;
  hasHideout: boolean;
  isRest: boolean;
  isCapital: boolean;
};

export type SecurityLevel = "SAFE" | "CAUTION" | "DANGER";

export type ClanDetail = {
  id: string;
  name: string;
  kind: "DISCORD" | "PERSONAL";
  discordGuildId: string | null;
  discordGuildName: string | null;
  discordGuildIcon: string | null;
  discordWebhookUrl: string | null;
  anchorZoneId: number | null;
  anchorZone: ClanAnchorZone | null;
  anchorSecurityLevel: SecurityLevel | null;
  anchorNotes: string | null;
  anchorNotesAt: string | null;
  botInstalled: boolean;
  _count?: { members: number; routes: number };
};

export function useClan(clanId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ClanDetail>(clanId ? `/api/clans/${clanId}` : null);
  return { clan: data, error, isLoading, mutate };
}
