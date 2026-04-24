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
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    // Session callback Edge-safe (sin Prisma) para que el middleware lo lea.
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.discordId === "string") {
        (session.user as unknown as Record<string, unknown>).discordId = token.discordId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
