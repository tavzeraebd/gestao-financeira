import { resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Variáveis do Supabase local (.env.local). Em CI elas já vêm do ambiente.
try {
  process.loadEnvFile(".env.local");
} catch {
  // arquivo ausente: as variáveis precisam estar no ambiente
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` lança fora do bundler do Next; aqui usa a versão vazia.
      "server-only": resolve(
        process.cwd(),
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    env: { APP_URL: "http://localhost:3000", LOG_LEVEL: "error" },
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
