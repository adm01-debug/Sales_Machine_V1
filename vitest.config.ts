import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Config isolada dos testes unitários — não carrega os plugins do TanStack Start,
 * de modo que os módulos puros (`template-vars`, `campaign-validation`) rodam
 * sem tocar no runtime do servidor.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});