import { describe, it, expect } from "vitest";
import { resolveAppRole, ROLE_HIERARCHY, hasMinRole } from "@/lib/permissions";
import type { AppRole } from "@/generated/prisma/client";

const mappings = [
  { clanId: "c1", discordRoleId: "r_admin",  discordRoleName: "Admin",  appRole: "ADMIN"       as AppRole, id: 1, createdAt: new Date() },
  { clanId: "c1", discordRoleId: "r_editor", discordRoleName: "Editor", appRole: "EDITOR"      as AppRole, id: 2, createdAt: new Date() },
  { clanId: "c1", discordRoleId: "r_vet",    discordRoleName: "Vet",    appRole: "EDITOR"      as AppRole, id: 3, createdAt: new Date() },
  { clanId: "c1", discordRoleId: "r_memb",   discordRoleName: "Member", appRole: "CONTRIBUTOR" as AppRole, id: 4, createdAt: new Date() },
];

describe("resolveAppRole", () => {
  it("returns null when user has no mapped roles", () => {
    expect(resolveAppRole([], mappings)).toBeNull();
    expect(resolveAppRole(["r_random"], mappings)).toBeNull();
  });

  it("returns the mapped role when user has exactly one", () => {
    expect(resolveAppRole(["r_memb"], mappings)).toBe("CONTRIBUTOR");
  });

  it("returns the highest role when user has multiple mapped", () => {
    expect(resolveAppRole(["r_memb", "r_editor"], mappings)).toBe("EDITOR");
    expect(resolveAppRole(["r_memb", "r_editor", "r_admin"], mappings)).toBe("ADMIN");
  });

  it("handles duplicates of same app role", () => {
    expect(resolveAppRole(["r_editor", "r_vet"], mappings)).toBe("EDITOR");
  });
});

describe("ROLE_HIERARCHY", () => {
  it("orders roles correctly", () => {
    expect(ROLE_HIERARCHY.VIEWER).toBeLessThan(ROLE_HIERARCHY.CONTRIBUTOR);
    expect(ROLE_HIERARCHY.CONTRIBUTOR).toBeLessThan(ROLE_HIERARCHY.EDITOR);
    expect(ROLE_HIERARCHY.EDITOR).toBeLessThan(ROLE_HIERARCHY.ADMIN);
  });
});

describe("hasMinRole", () => {
  it("returns false for null user role", () => {
    expect(hasMinRole(null, "VIEWER")).toBe(false);
  });
  it("returns true when equal", () => {
    expect(hasMinRole("EDITOR", "EDITOR")).toBe(true);
  });
  it("returns true when greater", () => {
    expect(hasMinRole("ADMIN", "EDITOR")).toBe(true);
  });
  it("returns false when less", () => {
    expect(hasMinRole("VIEWER", "EDITOR")).toBe(false);
  });
});
