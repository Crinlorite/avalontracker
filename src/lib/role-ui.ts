import type { AppRole } from "@/generated/prisma/client";

const ROLE_KEYS: Record<AppRole, string> = {
  ADMIN: "role.admin",
  EDITOR: "role.editor",
  CONTRIBUTOR: "role.contributor",
  VIEWER: "role.viewer",
};

type Translator = (key: string) => string;

export function roleLabel(role: AppRole | null, t: Translator): string {
  if (!role) return t("role.none");
  return t(ROLE_KEYS[role]);
}

const HIER: Record<AppRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, ADMIN: 4 };

function hasMin(role: AppRole | null, min: AppRole): boolean {
  if (!role) return false;
  return HIER[role] >= HIER[min];
}

export function canCreate(role: AppRole | null): boolean { return hasMin(role, "CONTRIBUTOR"); }
export function canDelete(role: AppRole | null): boolean { return hasMin(role, "EDITOR"); }
export function canAdmin(role: AppRole | null): boolean { return hasMin(role, "ADMIN"); }

export function roleBadgeColor(role: AppRole | null): string {
  if (role === "ADMIN") return "bg-purple-600 text-white";
  if (role === "EDITOR") return "bg-blue-600 text-white";
  if (role === "CONTRIBUTOR") return "bg-green-600 text-white";
  if (role === "VIEWER") return "bg-gray-600 text-white";
  return "bg-red-600 text-white";
}
