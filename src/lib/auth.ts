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

      const adminIds = superAdminIds();
      const isSuperAdmin = adminIds.includes(discordId);
      logger.info(
        { discordId, adminIdsCount: adminIds.length, adminIdsSample: adminIds.map(s => s.slice(0, 4) + "..."), isSuperAdmin },
        "signIn: super admin resolution"
      );

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
            const clan = await prisma.clan.findUnique({
              where: { discordGuildId: c.guildId },
              select: { id: true, createdById: true },
            });
            if (!clan || typeof token.id !== "string") continue;
            // Creador del clan siempre ADMIN (ver permissions.ts).
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
    // aquí via ...authConfig.callbacks — así el middleware Edge puede
    // ver session.user.isSuperAdmin.
  },
});
