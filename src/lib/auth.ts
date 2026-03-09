import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import Google from "next-auth/providers/google";
// import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";

// TODO: Reemplazar Credentials por Google OAuth para produccion
// 1. Descomentar Google provider y PrismaAdapter
// 2. Comentar/eliminar Credentials provider
// 3. Cambiar strategy a "database"
// 4. Ajustar callbacks

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  // adapter: PrismaAdapter(prisma),  // Activar con Google OAuth
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Password",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const password = process.env.AUTH_SIMPLE_PASSWORD;
        if (!password) {
          throw new Error("AUTH_SIMPLE_PASSWORD no configurada");
        }

        if (credentials?.password !== password) {
          return null;
        }

        const username = (credentials?.username as string) || "admin";

        // Buscar o crear usuario en la DB
        let user = await prisma.user.findFirst({
          where: { displayName: username },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email: `${username.toLowerCase().replace(/\s+/g, ".")}@local.dev`,
              displayName: username,
              name: username,
              isSuperAdmin: username === "admin",
            },
          });
        }

        return {
          id: user.id,
          name: user.displayName || user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
    // Google({
    //   clientId: process.env.AUTH_GOOGLE_ID!,
    //   clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    // }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;

        const dbUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { displayName: true, personalCode: true, isSuperAdmin: true },
        });

        if (dbUser) {
          session.user.displayName = dbUser.displayName;
          session.user.personalCode = dbUser.personalCode;
          session.user.isSuperAdmin = dbUser.isSuperAdmin;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
