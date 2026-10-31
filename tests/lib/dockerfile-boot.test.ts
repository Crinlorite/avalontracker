// El arranque del contenedor de producción no puede aceptar pérdida de datos: si el
// esquema de la imagen exige borrar columnas o filas, `prisma db push` debe fallar y
// el despliegue no arrancar, para que se decida a mano.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("arranque del contenedor", () => {
  const cmd = readFileSync(join(__dirname, "../../Dockerfile"), "utf8")
    .split("\n").filter((l) => l.startsWith("CMD ")).join("\n");

  it("aplica el esquema con prisma db push", () => {
    expect(cmd).toContain("npx prisma db push");
  });
  it("sin --accept-data-loss ni --force-reset", () => {
    expect(cmd).not.toContain("--accept-data-loss");
    expect(cmd).not.toContain("--force-reset");
  });
});
