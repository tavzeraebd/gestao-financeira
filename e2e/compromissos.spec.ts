import { expect, test } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  entrar,
  escolher,
  reais,
} from "./helpers/cenario";

const hoje = () => new Date().toLocaleDateString("sv-SE");

test("CA-E5-50: criar conta a pagar, ver na lista e marcar como pago (entra no saldo)", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c50-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);

  await page.goto("/compromissos");
  await expect(
    page
      .getByText("Nenhuma conta a pagar ou receber")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  await page.goto("/compromissos/novo");
  await page.getByLabel("Descrição").fill("Aluguel");
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Valor previsto").fill("300");
  await escolher(page, "Conta ou cartão", "Corrente");
  await page.getByRole("button", { name: "Salvar conta a pagar" }).click();
  await expect(page).toHaveURL(/\/compromissos$/);
  await expect(
    page.getByText("Aluguel").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Vence hoje").filter({ visible: true }).first(),
  ).toBeVisible();

  // Pendente não mexe no saldo.
  await page.goto("/contas");
  await expect(page.getByText(reais("1.000,00")).first()).toBeVisible();

  await page.goto("/compromissos");
  await page
    .getByRole("button", { name: "Marcar como pago" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByLabel("Valor")).toHaveValue("300,00");
  await page.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByLabel("Valor")).toHaveCount(0);

  await page.goto("/contas");
  await expect(page.getByText(reais("700,00")).first()).toBeVisible();
});

test("CA-E5-51: série com Repetir cria ocorrências e o selo Recorrente", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c51-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "0");
  await entrar(page, c.owner);

  await page.goto("/compromissos/novo");
  await page.getByLabel("Descrição").fill("Internet");
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Valor previsto").fill("100");
  await escolher(page, "Conta ou cartão", "Corrente");
  await page.getByRole("switch", { name: "Repetir" }).click();
  await expect(page.getByLabel("Frequência")).toBeVisible();
  await page.getByRole("button", { name: "Salvar recorrência" }).click();
  await expect(page).toHaveURL(/\/compromissos$/);
  await expect(
    page.getByText("Recorrente").filter({ visible: true }).first(),
  ).toBeVisible();
});

test("CA-E5-52: cancelar pede confirmação e tira o compromisso dos abertos", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c52-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "0");
  await entrar(page, c.owner);

  await page.goto("/compromissos/novo");
  await page.getByLabel("Descrição").fill("Seguro");
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Valor previsto").fill("50");
  await escolher(page, "Conta ou cartão", "Corrente");
  await page.getByRole("button", { name: "Salvar conta a pagar" }).click();
  await expect(page).toHaveURL(/\/compromissos$/);

  await page
    .getByRole("link", { name: /Seguro/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Seguro" })).toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar compromisso", exact: true })
    .click();
  await expect(
    page.getByText(
      "O compromisso fica no histórico e deixa de aparecer como previsto.",
    ),
  ).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancelar compromisso" })
    .click();
  await expect(page.getByText("Cancelado").first()).toBeVisible();

  await page.goto(`/compromissos?situacao=abertos&de=${hoje()}`);
  await expect(page.getByText("Seguro")).toHaveCount(0);
});

test("CA-E5-53: id inexistente leva ao não encontrado", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c53-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "0");
  await entrar(page, c.owner);
  // Com loading.tsx o Next já enviou o status 200 ao transmitir a página;
  // o "não encontrado" aparece no conteúdo (e com noindex), não no status.
  await page.goto("/compromissos/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});
