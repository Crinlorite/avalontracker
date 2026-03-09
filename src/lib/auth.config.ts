import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Auth config sin Prisma - usado por el middleware (Edge runtime)
export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "Password",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      // authorize se define en auth.ts completo, no aquí
      authorize: () => null,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
