import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";

const TWO_WEEKS = 60 * 60 * 24 * 14;
const IS_PROD = process.env.NODE_ENV === "production";

export const authConfig = {
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  pages: { signIn: "/" },
  // Coolify pone Avalon Tracker tras Traefik; sin trustHost NextAuth
  // rechaza el host detectado y rompe el callback de OAuth.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: TWO_WEEKS,
    updateAge: 60 * 60 * 24,
  },
  // Cookie de sesión persistente. Sin `maxAge` explícito aquí, NextAuth
  // v5 beta a veces emite la cookie como "session cookie" sin atributo
  // Expires/Max-Age — el navegador la borra al cerrar la pestaña y el
  // usuario tiene que loguear cada vez. Forzamos 14 días igual que el JWT.
  cookies: {
    sessionToken: {
      name: `${IS_PROD ? "__Secure-" : ""}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: IS_PROD,
        maxAge: TWO_WEEKS,
      },
    },
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
