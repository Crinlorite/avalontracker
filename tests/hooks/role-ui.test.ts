import { describe, it, expect } from "vitest";
import { roleLabel, canCreate, canDelete, canAdmin } from "@/lib/role-ui";

describe("roleLabel", () => {
  it("maps enum → ES", () => {
    expect(roleLabel("ADMIN")).toBe("Admin");
    expect(roleLabel("EDITOR")).toBe("Editor");
    expect(roleLabel("CONTRIBUTOR")).toBe("Colaborador");
    expect(roleLabel("VIEWER")).toBe("Observador");
    expect(roleLabel(null)).toBe("Sin acceso");
  });
});

describe("permission helpers", () => {
  it("canCreate: CONTRIBUTOR+", () => {
    expect(canCreate("VIEWER")).toBe(false);
    expect(canCreate("CONTRIBUTOR")).toBe(true);
    expect(canCreate("EDITOR")).toBe(true);
    expect(canCreate("ADMIN")).toBe(true);
    expect(canCreate(null)).toBe(false);
  });
  it("canDelete: EDITOR+", () => {
    expect(canDelete("CONTRIBUTOR")).toBe(false);
    expect(canDelete("EDITOR")).toBe(true);
    expect(canDelete("ADMIN")).toBe(true);
  });
  it("canAdmin: ADMIN only", () => {
    expect(canAdmin("EDITOR")).toBe(false);
    expect(canAdmin("ADMIN")).toBe(true);
  });
});
