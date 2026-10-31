import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "scripts/__tests__/**/*.test.ts"],
    // next-auth importa `next/server` sin extensión; fuera de Next solo lo
    // resuelve Vite, así que se procesa en lugar de dejarlo a Node.
    server: { deps: { inline: ["next-auth"] } },
  },
});
