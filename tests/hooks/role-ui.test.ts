import { describe, it, expect } from "vitest";
import { roleLabel, canCreate, canDelete, canAdmin } from "@/lib/role-ui";

describe("roleLabel", () => {
  // El translator se mockea como identity → comprueba que devuelve la
  // key correcta. La traducción real vive en src/i18n/translations.ts y
  // se prueba implícitamente por uso en la UI.
  const id = (k: string) => k;
  it("maps enum → translation key", () => {
    expect(roleLabel("ADMIN", id)).toBe("role.admin");
    expect(roleLabel("EDITOR", id)).toBe("role.editor");
    expect(roleLabel("CONTRIBUTOR", id)).toBe("role.contributor");
    expect(roleLabel("VIEWER", id)).toBe("role.viewer");
    expect(roleLabel(null, id)).toBe("role.none");
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
