import { expect, test } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
  escolher,
} from "./helpers/cenario";

test("CA-E3-62: criar, usar, arquivar e excluir categoria", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`cat62-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente");
  await entrar(page, c.owner);
  await page.goto("/categorias");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Pets");
  await page.getByRole("radio", { name: "Cor 2" }).click();
  await page.getByRole("radio", { name: "Ícone Cachorro" }).click();
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(
    page
      .locator('[data-testid=\"categoria\"]:visible')
      .filter({ hasText: "Pets" }),
  ).toBeVisible();

  await page.goto("/transacoes/nova");
  await page.getByRole("combobox", { name: "Categoria", exact: true }).click();
  await expect(page.getByRole("option", { name: "Pets" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/categorias");
  await page.getByRole("button", { name: "Arquivar Pets" }).click();
  await expect(
    page
      .locator('[data-testid=\"categoria\"]:visible')
      .filter({ hasText: "Pets" }),
  ).toHaveCount(0);
  await page.goto("/transacoes/nova");
  await page.getByRole("combobox", { name: "Categoria", exact: true }).click();
  await expect(page.getByRole("option", { name: "Pets" })).toHaveCount(0);
});

test("categoria com lançamento não é excluída: orienta arquivar", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`cat62b-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente");
  await entrar(page, c.owner);
  await page.goto("/transacoes/nova");
  await page.getByLabel("Descrição").fill("Feira");
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Valor").fill("10");
  await escolher(page, "Conta ou cartão", "Corrente");
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page).toHaveURL(/\/transacoes$/);

  await page.goto("/categorias");
  await page.getByRole("button", { name: "Excluir Mercado" }).click();
  await page.getByRole("button", { name: "Excluir categoria" }).click();
  await expect(
    page.getByText("Esta categoria tem lançamentos. Arquive-a", {
      exact: false,
    }),
  ).toBeVisible();
});

test("member não vê ações de categoria", async ({ page }, testInfo) => {
  const c = await criarCenario(`cat56-${testInfo.project.name}`);
  const member = await criarIntegrante(
    c.familyId,
    `m62-${testInfo.project.name}`,
  );
  await entrar(page, member);
  await page.goto("/categorias");
  await expect(
    page.locator('[data-testid=\"categoria\"]:visible').first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nova categoria" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
});
