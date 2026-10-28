import { expect, test } from "@playwright/test";

import { sessionFile } from "./helpers/shared-users";

test.describe("Atividade da família (dono)", () => {
  test.use({ storageState: sessionFile("owner") });

  test("CA-E7-56: dono abre a atividade, filtra por grupo e a URL guarda o filtro", async ({
    page,
  }) => {
    await page.goto("/familia");
    await page.getByRole("link", { name: "Ver atividade" }).click();
    await expect(page).toHaveURL(/\/familia\/atividade$/);
    await expect(
      page.getByRole("heading", { name: "Atividade da família", level: 1 }),
    ).toBeVisible();

    await page.goto("/familia/atividade?grupo=metas");
    await expect(page.getByLabel("Grupo")).toContainText("Metas");
    await expect(
      page
        .getByRole("heading", { name: "Nenhuma atividade registrada" })
        .or(page.getByRole("list", { name: "Atividade da família" }))
        .or(page.getByRole("table", { name: "Atividade da família" })),
    ).toBeVisible();
  });
});

test.describe("Atividade da família (integrante)", () => {
  test.use({ storageState: sessionFile("member") });

  test("CA-E7-56: integrante recebe página não encontrada", async ({
    page,
  }) => {
    // Com loading.tsx a resposta já começou como 200 quando notFound() dispara: confira a tela.
    await page.goto("/familia/atividade");
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Atividade da família" }),
    ).toHaveCount(0);
  });
});
