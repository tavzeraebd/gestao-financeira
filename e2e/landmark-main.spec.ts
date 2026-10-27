import { expect, test } from "@playwright/test";

import { sessionFile } from "./helpers/shared-users";

test.describe("Landmark main único (D2)", () => {
  test.describe("telas do app", () => {
    test.use({ storageState: sessionFile("owner") });

    for (const rota of [
      "/inicio",
      "/transacoes",
      "/transacoes/nova",
      "/contas",
      "/categorias",
      "/familia",
      "/configuracoes",
    ]) {
      test(`${rota} tem exatamente 1 main`, async ({ page }) => {
        await page.goto(rota);
        await expect(page.locator("main")).toHaveCount(1);
      });
    }
  });

  test.describe("telas públicas", () => {
    test("/login tem exatamente 1 main", async ({ page }) => {
      await page.goto("/login");
      await expect(page.locator("main")).toHaveCount(1);
    });
  });
});
