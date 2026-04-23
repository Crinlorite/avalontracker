import useSWR from "swr";
import type { AppRole } from "@/generated/prisma/client";

export type Me = {
  id: string; discordId: string; discordUsername: string; globalNickname: string | null;
  displayName: string | null; image: string | null;
  // Campo opcional: solo se incluye para usuarios "owner" del deployment.
  // El endpoint /api/me omite el campo entero para el resto de usuarios.
  tier?: "owner";
};

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me>("/api/me");
  return { me: data, error, isLoading, mutate };
}
