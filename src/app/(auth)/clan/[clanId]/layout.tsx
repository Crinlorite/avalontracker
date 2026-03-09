import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ClanTabs from "@/components/clan/ClanTabs";

export default async function ClanLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clanId: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const { clanId } = await params;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClanTabs clanId={clanId} />
      {children}
    </div>
  );
}
