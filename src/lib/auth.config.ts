import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";

export const authConfig = {
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  pages: { signIn: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    // IMPORTANTE: este session callback vive aquí (Edge-safe, sin Prisma)
    // para que el middleware Edge pueda leer session.user.tier y
    // session.user.id desde el JWT token. Si estuviera solo en auth.ts,
    // el middleware nunca los vería (auth.ts no corre en Edge).
    // El jwt callback en auth.ts es el que POPULA token.isSuperAdmin —
    // aquí traducimos al shape público: tier="owner" si el flag está, sino
    // el campo no se incluye (stealth client-side).
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.discordId === "string") {
        (session.user as unknown as Record<string, unknown>).discordId = token.discordId;
      }
      if (token.isSuperAdmin === true) {
        (session.user as unknown as Record<string, unknown>).tier = "owner";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
