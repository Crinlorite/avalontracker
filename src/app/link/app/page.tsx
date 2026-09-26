import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signLinkCode } from "@/lib/device-tokens";
import { LinkApp } from "@/components/link/LinkApp";

export const metadata: Metadata = { title: "Link the app", robots: { index: false, follow: false } };

// La app abre esta página en el navegador del sistema. Con sesión de
// Discord, emite un código de un solo uso (60 s) y devuelve a la app por
// el esquema avalontracker:// (spec §5.2, flujo 3).
export default async function LinkAppPage() {
  const session = await auth();
  if (!session?.user?.id) return <LinkApp state="signin" />;
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isGuest: true } });
  if (!u || u.isGuest) return <LinkApp state="guest" />;
  return <LinkApp state="ready" code={signLinkCode(session.user.id)} />;
}
