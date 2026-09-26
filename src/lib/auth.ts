import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { authConfig } from "@/lib/auth.config";
import { createGuestUser, CLAIM_COOKIE, verifyClaim, mergeGuestInto } from "@/lib/guest";
import { createLimiter, consumeToken } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { fetchUserClans } from "@/lib/vigil-bot-client";
import { logger } from "@/lib/logger";

// Altas de invitado por IP: suficiente para quien juega desde varios
// navegadores, corta a quien intente llenar la BD de cuentas vacías.
const guestLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    // Invitado: sin credenciales. Cada llamada crea una cuenta nueva.
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {},
      async authorize(_credentials, request) {
        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (!consumeToken(guestLimiter, ip).ok) return null;
        const u = await createGuestUser();
        return { id: u.id, name: u.discordUsername };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, profile, account }) {
      if (account?.provider === "guest") return true;
      if (account?.provider !== "discord") return false;
      const discordId = account.providerAccountId;
      const username = (profile as { username?: string })?.username ?? user.name ?? "unknown";
      const avatar = (profile as { avatar?: string })?.avatar ?? null;
      const globalNickname = (profile as { global_name?: string })?.global_name ?? null;

      await prisma.user.upsert({
        where: { discordId },
        create: {
          discordId,
          discordUsername: username,
          discordAvatar: avatar,
          globalNickname,
          email: user.email ?? `${discordId}@discord.local`,
          image: user.image ?? null,
        },
        update: {
          discordUsername: username,
          discordAvatar: avatar,
          globalNickname,
          email: user.email ?? `${discordId}@discord.local`,
          image: user.image ?? null,
        },
      });
      return true;
    },

    async jwt({ token, account, user, trigger }) {
      if (account?.provider === "guest") {
        token.id = user.id;
        token.guest = true;
        delete token.discordId;
        return token;
      }
      if (token.guest) return token;
      if (account?.provider === "discord") {
        token.discordId = account.providerAccountId;
        token.guest = false;
      }
      if (!token.discordId && typeof token.sub === "string") {
        token.discordId = token.sub;
      }
      if (!token.id && token.discordId) {
        const u = await prisma.user.findUnique({ where: { discordId: token.discordId as string } });
        if (u) {
          token.id = u.id;
        }
      }

      // Entrada con Discord desde una sesión de invitado: se pasan sus
      // mapas a la cuenta real (cookie firmada puesta por /api/guest/claim).
      if (trigger === "signIn" && account?.provider === "discord" && typeof token.id === "string") {
        try {
          const jar = await cookies();
          const guestId = verifyClaim(jar.get(CLAIM_COOKIE)?.value);
          if (guestId) {
            const moved = await mergeGuestInto(guestId, token.id);
            logger.info({ moved }, "guest merged into discord account");
          }
          jar.delete(CLAIM_COOKIE);
        } catch (err) {
          logger.warn({ err }, "guest merge failed; discord sign-in continues");
        }
      }

      if (trigger === "signIn" && token.discordId) {
        try {
          const clans = await fetchUserClans(token.discordId as string);
          for (const c of clans) {
            const clan = await prisma.clan.findUnique({
              where: { discordGuildId: c.guildId },
              select: { id: true, createdById: true },
            });
            if (!clan || typeof token.id !== "string") continue;
            // Creador del clan siempre ADMIN de ese clan (ver permissions.ts).
            const isCreator = clan.createdById === token.id;
            const appRole = isCreator ? "ADMIN" : c.computedAppRole;
            const roleSource = isCreator
              ? "creator:permanent"
              : `discord:${c.discordRoleIds.join(",")}`;
            await prisma.clanMember.upsert({
              where: { userId_clanId: { userId: token.id, clanId: clan.id } },
              create: {
                userId: token.id,
                clanId: clan.id,
                appRole,
                roleSource,
                lastSyncAt: new Date(),
              },
              update: {
                appRole,
                roleSource,
                lastSyncAt: new Date(),
              },
            });
          }
        } catch (err) {
          logger.warn({ err }, "vigil bot unavailable during signIn; user logged in without clan sync");
        }
      }

      return token;
    },

    // session callback vive en auth.config.ts (Edge-safe) y se hereda
    // aquí via ...authConfig.callbacks.
  },
});
