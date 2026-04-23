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
    // Reducimos vs el default de 30 días para acortar la ventana de
    // explotación si un token de sesión se filtra. updateAge re-emite el
    // token cada 24h en cada request, alargando la sesión activa de un
    // user que entra a diario sin forzar re-login frecuente.
    maxAge: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    // IMPORTANTE: este session callback vive aquí (Edge-safe, sin Prisma)
    // para que el middleware Edge pueda leer session.user.tier y
    // session.user.id desde el JWT token. Si estuviera solo en auth.ts,
    // el middleware nunca los vería (auth.ts no corre en Edge).
    // El jwt callback en auth.ts es el que POPULA token.isSuperAdmin —
    // aquí traducimos al shape público: tier="alpha" si el flag está,
    // sino el campo se omite por completo (stealth client-side).
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.discordId === "string") {
        (session.user as unknown as Record<string, unknown>).discordId = token.discordId;
      }
      if (token.isSuperAdmin === true) {
        (session.user as unknown as Record<string, unknown>).tier = "alpha";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
