import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordId: string;
      // Opcional: solo presente para usuarios con tier "owner" (dueño del
      // deployment). Omitido por completo para el resto — no hay rastro en
      // el main bundle.
      tier?: "owner";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    discordId?: string;
    isSuperAdmin?: boolean;
  }
}
