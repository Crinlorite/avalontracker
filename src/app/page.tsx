import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingLoginDiscord } from "@/components/auth/LandingLoginDiscord";

// Server component: si hay sesión NextAuth válida (cookie JWT vigente),
// saltamos el landing y mandamos directo al dashboard. Sin esto el
// usuario ya logueado veía el botón "Sign in with Discord" cada vez
// que volvía a /, generando confusión y un re-OAuth innecesario.
export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return <LandingLoginDiscord />;
}
