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
  },
} satisfies NextAuthConfig;
