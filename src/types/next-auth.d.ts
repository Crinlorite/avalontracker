import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      displayName?: string | null;
      personalCode?: string | null;
      isSuperAdmin?: boolean;
    };
  }
}
