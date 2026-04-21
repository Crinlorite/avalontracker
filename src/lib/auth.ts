import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";
import { fetchUserClans } from "@/lib/vigil-bot-client";
import { logger } from "@/lib/logger";

function superAdminIds(): string[] {
  return (process.env.SUPER_ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, profile, account }) {
      if (account?.provider !== "discord") return false;
      const discordId = account.providerAccountId;
      const username = (profile as { username?: string })?.username ?? user.name ?? "unknown";
      const avatar = (profile as { avatar?: string })?.avatar ?? null;
      const globalNickname = (profile as { global_name?: string })?.global_name ?? null;

      const isSuperAdmin = superAdminIds().includes(discordId);

      await prisma.user.upsert({
        where: { discordId },
        create: {
          discordId,
          discordUsername: username,
          discordAvatar: avatar,
          globalNickname,
          email: user.email ?? `${discordId}@discord.local`,
          image: user.image ?? null,
          isSuperAdmin,
        },
        update: {
          discordUsername: username,
          discordAvatar: avatar,
          globalNickname,
          email: user.email ?? `${discordId}@discord.local`,
          image: user.image ?? null,
          isSuperAdmin,
        },
      });
      return true;
    },

    async jwt({ token, account, profile, trigger }) {
      if (account?.provider === "discord") {
        token.discordId = account.providerAccountId;
      }
      if (!token.discordId && typeof token.sub === "string") {
        token.discordId = token.sub;
      }
      if (!token.id && token.discordId) {
        const u = await prisma.user.findUnique({ where: { discordId: token.discordId as string } });
        if (u) {
          token.id = u.id;
          token.isSuperAdmin = u.isSuperAdmin;
        }
      }

      if (trigger === "signIn" && token.discordId) {
        try {
          const clans = await fetchUserClans(token.discordId as string);
          for (const c of clans) {
            const clan = await prisma.clan.findUnique({ where: { discordGuildId: c.guildId } });
            if (!clan || typeof token.id !== "string") continue;
            await prisma.clanMember.upsert({
              where: { userId_clanId: { userId: token.id, clanId: clan.id } },
              create: {
                userId: token.id,
                clanId: clan.id,
                appRole: c.computedAppRole,
                roleSource: `discord:${c.discordRoleIds.join(",")}`,
                lastSyncAt: new Date(),
              },
              update: {
                appRole: c.computedAppRole,
                roleSource: `discord:${c.discordRoleIds.join(",")}`,
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

    async session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.discordId === "string") (session.user as unknown as Record<string, unknown>).discordId = token.discordId;
      (session.user as unknown as Record<string, unknown>).isSuperAdmin = Boolean(token.isSuperAdmin);
      return session;
    },
  },
});
