import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
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
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
        if (superAdminEmail && user.email === superAdminEmail) {
          await prisma.user.updateMany({
            where: { email: user.email },
            data: { isSuperAdmin: true },
          });
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/",
  },
});
