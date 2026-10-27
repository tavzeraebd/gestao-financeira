import { expect, test } from "@playwright/test";

import { sessionFile } from "./helpers/shared-users";

test.use({ storageState: sessionFile("owner") });

test("D1: sessão apagada leva ao login com o aviso e volta à rota (ADR-0017)", async ({
  page,
  context,
}) => {
  await page.goto("/configuracoes");
  const nome = page.getByLabel("Nome de exibição");
  await expect(nome).toBeEnabled();
  const original = await nome.inputValue();
  await nome.fill(`${original} X`);

  await context.clearCookies();
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page).toHaveURL(
    /\/login\?motivo=sessao_expirada&next=%2Fconfiguracoes$/,
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Sua sessão expirou" }),
  ).toBeVisible();
});
