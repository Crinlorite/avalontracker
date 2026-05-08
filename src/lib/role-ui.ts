import type { AppRole } from "@/generated/prisma/client";

const LABELS: Record<AppRole, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  CONTRIBUTOR: "Colaborador",
  VIEWER: "Observador",
};

export function roleLabel(role: AppRole | null): string {
  if (!role) return "Sin acceso";
  return LABELS[role];
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
