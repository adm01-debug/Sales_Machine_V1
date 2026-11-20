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
    // Fix do dual-package hazard do zod: zod 3.25.76 publica entrada com
    // source-dialect (@zod/source, apontando para TS), que o pipeline SSR do
    // vitest nao interopera, deixando o named export `z` undefined no runtime.
    // Inline do zod faz o vite processar o pacote como codigo fonte.
    server: { deps: { inline: ["zod"] } },
  },
});
