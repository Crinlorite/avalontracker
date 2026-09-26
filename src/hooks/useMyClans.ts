import useSWR from "swr";
import type { AppRole } from "@/generated/prisma/client";

export type MyClan = {
  id: string; name: string; kind: "DISCORD" | "PERSONAL"; discordGuildId: string | null; discordGuildName: string | null; discordGuildIcon: string | null; myRole: AppRole | null;
};

export function useMyClans() {
  const { data, error, isLoading, mutate } = useSWR<MyClan[]>("/api/me/clans");
  return { clans: data ?? [], error, isLoading, mutate };
}
