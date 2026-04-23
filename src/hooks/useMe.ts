import useSWR from "swr";
import type { AppRole } from "@/generated/prisma/client";

export type Me = {
  id: string; discordId: string; discordUsername: string; globalNickname: string | null;
  displayName: string | null; image: string | null;
  // Campo opcional: solo presente para users con el flag; el endpoint /api/me
  // lo omite cuando es false. Comprobar con `me?.isSuperAdmin === true`.
  isSuperAdmin?: true;
};

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me>("/api/me");
  return { me: data, error, isLoading, mutate };
}
