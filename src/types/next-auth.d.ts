import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordId: string;
      // Opcional: solo se incluye para usuarios con flag interno. Cualquier
      // valor diferente a "alpha" hoy no existe; el campo se omite en
      // usuarios normales para no tener rastro en el bundle del cliente.
      tier?: "alpha";
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
