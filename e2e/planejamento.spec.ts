import { expect, test, type Page } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  entrar,
  escolher,
} from "./helpers/cenario";

const CENARIO = "Qual objetivo você quer simular?";
const DISCLAIMER =
  "Simulação para apoiar decisões. Não é recomendação nem aconselhamento financeiro.";

const visivel = (page: Page, texto: string | RegExp) =>
  page.getByText(texto).filter({ visible: true }).first();

test("CA-E6-56: financiamento com 1,5% mostra parcela e total, origens, premissas e o aviso; nada vai à URL", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c56-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);

  await page.goto("/planejamento");
  await expect(visivel(page, DISCLAIMER)).toBeVisible();

  await page.getByLabel("Valor do bem").fill("60000");
  await page.getByLabel("Entrada").fill("0");
  await page.getByLabel("Prazo em meses").fill("36");
  await page.getByLabel("Taxa mensal (%)").fill("1,5");
  await page.getByRole("button", { name: "Simular" }).click();

  await expect(visivel(page, /2\.169,14/)).toBeVisible();
  await expect(visivel(page, /78\.089,17/)).toBeVisible();
  await expect(visivel(page, "Informado")).toBeVisible();
  await expect(visivel(page, "Estimado")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premissas" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");

  // Recarregar limpa as entradas.
  await page.reload();
  await expect(page.getByLabel("Valor do bem")).toHaveValue("");
  await expect(visivel(page, DISCLAIMER)).toBeVisible();
});

test("CA-E6-56: saldo futuro e novo compromisso usam a base conhecida", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c56b-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await page.goto("/planejamento");

  await escolher(page, CENARIO, "Saldo futuro");
  await page.getByRole("button", { name: "Simular" }).click();
  await expect(
    page
      .getByRole("columnheader", { name: "Saldo projetado" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  await escolher(page, CENARIO, "Novo compromisso mensal");
  await page.getByLabel("Valor mensal do compromisso").fill("500");
  await page.getByRole("button", { name: "Simular" }).click();
  await expect(visivel(page, "Conhecido")).toBeVisible();
  await expect(visivel(page, DISCLAIMER)).toBeVisible();
});

test("CA-E6-56: sem contas, cenários com base ficam indisponíveis e financiamento funciona", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c56c-${testInfo.project.name}`);
  await entrar(page, c.owner);
  await page.goto("/planejamento");

  await escolher(page, CENARIO, "Saldo futuro");
  await expect(
    visivel(page, "Cadastre uma conta para simular com seus dados"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Simular" })).toBeDisabled();

  await escolher(page, CENARIO, "Juntar para uma viagem ou objetivo");
  await page.getByLabel("Valor do objetivo").fill("6000");
  await page.getByLabel("Aporte mensal (opcional)").fill("500");
  await page.getByRole("button", { name: "Simular" }).click();
  await expect(page.getByRole("heading", { name: "Premissas" })).toBeVisible();
});
