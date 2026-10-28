import { expect, test } from "@playwright/test";

import { sessionFile } from "./helpers/shared-users";

test.describe("Notificações", () => {
  test.use({ storageState: sessionFile("owner") });

  test("CA-E7-54/60: sino no cabeçalho, abas por URL e sem rolagem horizontal", async ({
    page,
  }) => {
    await page.goto("/inicio");
    await expect(
      page.getByRole("link", { name: /^Notificações/ }).first(),
    ).toBeVisible();

    await page.goto("/notificacoes");
    await expect(
      page.getByRole("heading", { name: "Notificações", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Marcar todas como lidas" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Lembretes" }).click();
    await expect(page).toHaveURL(/\/notificacoes\?aba=lembretes$/);
    await expect(page.getByRole("link", { name: "Lembretes" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.reload();
    await expect(page.getByRole("link", { name: "Lembretes" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("estado vazio orienta o que aparece na central", async ({ page }) => {
    await page.goto("/notificacoes?aba=conquistas");
    const vazio = page.getByRole("heading", { name: "Nenhuma notificação" });
    const lista = page.getByRole("list", { name: "Notificações" });
    await expect(vazio.or(lista)).toBeVisible();
  });
});
