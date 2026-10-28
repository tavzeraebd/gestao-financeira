import { defineConfig, devices } from "@playwright/test";

import { VIEWPORTS } from "./e2e/helpers/viewports";

/**
 * Camada 1 da ADR-0032: telas que renderizam sem sessão e sem banco.
 * Sem `globalSetup` (nada de Supabase). Build de produção local com variáveis públicas
 * fictícias: sem cookie, o proxy não chama a rede (CA-E8-60).
 */
const PORTA = 3300;
const BASE_URL = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "./e2e/publico",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 1 : 3,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/publico" }],
  ],
  outputDir: "test-results/publico",
  use: {
    baseURL: BASE_URL,
    trace: "off",
    serviceWorkers: "block",
  },
  projects: [
    ...(
      Object.entries(VIEWPORTS) as [string, { width: number; height: number }][]
    ).map(([name, viewport]) => ({
      name,
      // pwa.spec.ts tem projeto próprio; reflow.spec.ts fixa o próprio viewport e roda uma vez.
      testIgnore:
        name === "v1280"
          ? ["**/pwa.spec.ts"]
          : ["**/pwa.spec.ts", "**/reflow.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport },
    })),
    {
      // Service worker liberado só aqui (CA-E8-08, 09, 12).
      name: "pwa",
      testMatch: ["**/pwa.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: VIEWPORTS.v1280,
        serviceWorkers: "allow",
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORTA}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 420_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-publica-ficticia-sem-banco",
      APP_URL: BASE_URL,
    },
  },
});
