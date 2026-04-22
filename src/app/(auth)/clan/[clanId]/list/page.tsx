"use client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { useMe } from "@/hooks/useMe";
import { RouteListTable } from "@/components/routes/RouteListTable";
import { ViewToggle } from "@/components/clan/ViewToggle";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function ClanListPage() {
  const { clanId } = useParams() as { clanId: string };
  const { routes, isLoading } = useClanRoutes(clanId);
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const { me } = useMe();
  const memberRole = members.find((m) => m.userId === me?.id)?.appRole ?? null;
  const myRole: AppRole | null = me?.isSuperAdmin ? "ADMIN" : memberRole;

  if (isLoading) return <div className="text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ViewToggle clanId={clanId} />
      </div>
      <RouteListTable routes={routes} myRole={myRole} />
    </div>
  );
}
