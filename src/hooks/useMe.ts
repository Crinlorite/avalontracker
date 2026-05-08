import useSWR from "swr";

export type Me = {
  id: string; discordId: string; discordUsername: string; globalNickname: string | null;
  displayName: string | null; image: string | null;
};

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me>("/api/me");
  return { me: data, error, isLoading, mutate };
}
