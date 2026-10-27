import { expect, test } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
  escolher,
  lancar,
} from "./helpers/cenario";

import { reais } from "./helpers/cenario";

test("CA-E3-50: primeira conta pelo início, saldo em /contas", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`conta50-${testInfo.project.name}`);
  await entrar(page, c.owner);
  await expect(
    page.getByRole("heading", { name: "Cadastre sua primeira conta" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cadastrar conta" }).click();
  await expect(page).toHaveURL(/\/contas\/nova$/);
  await page.getByLabel("Nome da conta").fill("Conta principal");
  await page.getByLabel("Saldo inicial").fill("1000");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);
  const conta = page
    .locator('[data-testid=\"conta\"]:visible')
    .filter({ hasText: "Conta principal" });
  await expect(conta).toContainText(reais("1.000,00"));
  await expect(
    page.locator('[data-testid=\"saldo-total\"]:visible'),
  ).toContainText(reais("1.000,00"));
});

test("CA-E3-61: cartão com limite, compra e pagamento da fatura", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`conta61-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente");
  await entrar(page, c.owner);
  await page.goto("/contas/nova");
  await page.getByLabel("Nome da conta").fill("Visa");
  await escolher(page, "Tipo", "Cartão de crédito");
  await page.getByLabel("Fatura atual (valor devido)").fill("0");
  await page.getByLabel(/Limite do cartão/).fill("2000");
  await page.getByLabel("Dia de fechamento").fill("10");
  await page.getByLabel("Dia de vencimento").fill("20");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);

  await lancar(page, {
    tipo: "Despesa",
    descricao: "Compra",
    valor: "300",
    conta: "Visa",
    categoria: "Mercado",
  });
  await page.goto("/contas");
  const visa = page
    .locator('[data-testid=\"conta\"]:visible')
    .filter({ hasText: "Visa" });
  await expect(visa).toContainText(reais("300,00"));
  await expect(visa).toContainText(reais("1.700,00"));
  await expect(
    page.locator('[data-testid=\"saldo-total\"]:visible'),
  ).toContainText(reais("0,00"));

  await lancar(page, {
    tipo: "Transferência",
    descricao: "Pagamento da fatura",
    valor: "300",
    conta: "Corrente",
    destino: "Visa",
  });
  await page.goto("/contas");
  await expect(
    page.locator('[data-testid=\"saldo-total\"]:visible'),
  ).toContainText(/300,00/);
  await expect(
    page.locator('[data-testid=\"faturas-em-aberto\"]:visible'),
  ).toContainText(reais("0,00"));
});

test("member não vê Nova conta e não abre o formulário", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`conta56-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "10");
  const member = await criarIntegrante(
    c.familyId,
    `m56-${testInfo.project.name}`,
  );
  await entrar(page, member);
  await page.goto("/contas");
  await expect(page.locator('[data-testid=\"conta\"]:visible')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Nova conta" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Editar/ })).toHaveCount(0);
  await page.goto("/contas/nova");
  await expect(page.getByText(/não encontrada/i).first()).toBeVisible();
});
