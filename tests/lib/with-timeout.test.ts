// Tope de tiempo para lecturas opcionales en el render (revisión final fase 2, importante 5).
import { describe, it, expect } from "vitest";
import { withTimeout } from "@/lib/with-timeout";

describe("withTimeout", () => {
  it("devuelve el valor si llega a tiempo", async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });
  it("rechaza con un error de timeout si la promesa se cuelga", async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 20)).rejects.toThrow(/timeout/);
  });
  it("propaga el rechazo original", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
});
