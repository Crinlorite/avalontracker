"use client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { RouteListTable } from "@/components/routes/RouteListTable";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function ClanListPage() {
  const { clanId } = useParams() as { clanId: string };
  const { routes, isLoading } = useClanRoutes(clanId);
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const { data: me } = useSWR<{ id: string }>("/api/me");
  const myRole = members.find((m) => m.userId === me?.id)?.appRole ?? null;

  if (isLoading) return <div className="text-slate-400">Cargando…</div>;
  return <RouteListTable routes={routes} myRole={myRole} />;
}
