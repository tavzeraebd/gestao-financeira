import { expect, test } from "@playwright/test";

import {
  clienteDo,
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
  escolher,
  reais,
  type Cenario,
} from "./helpers/cenario";
import { adminClient } from "./helpers/users";

const visivel = (page: import("@playwright/test").Page, texto: string | RegExp) =>
  page.getByText(texto).filter({ visible: true }).first();

/** Despesa pendente de 200,00 criada pelo próprio dono (cliente do usuário: passa pela RLS e pelos gatilhos). */
async function semearDespesa(
  c: Cenario,
  descricao = "Mercado do mês",
  status: "paid" | "pending" = "paid",
) {
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const { data: categoria } = await adminClient()
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", "Mercado")
    .single();
  const { data, error } = await (
    await clienteDo(c.owner)
  )
    .from("transactions")
    .insert({
      family_id: c.familyId,
      type: "expense",
      account_id: conta,
      category_id: categoria?.id as string,
      description: descricao,
      amount: "200.00",
      transaction_date: "2026-09-15",
      status,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Falha ao semear despesa: ${error?.message}`);
  return data.id as string;
}

test("CA-E6-54: dividir igualmente mostra a prévia, aparece em /divisao e atualiza 'Quem deve a quem'", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c54-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c54b-${testInfo.project.name}`);
  const id = await semearDespesa(c);
  await entrar(page, c.owner);

  await page.goto("/divisao");
  await expect(visivel(page, "Nenhuma despesa dividida")).toBeVisible();
  await expect(visivel(page, "Ninguém deve nada")).toBeVisible();

  await page.goto(`/divisao/${id}`);
  await expect(
    page
      .getByText("A divisão só registra quanto cabe a cada um.")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(visivel(page, reais("100,00"))).toBeVisible();
  await page.getByRole("button", { name: "Salvar divisão" }).click();
  await expect(page.getByRole("button", { name: "Remover divisão" })).toBeVisible();

  await page.goto("/divisao");
  await expect(visivel(page, /Dividida entre 2/)).toBeVisible();
  await expect(visivel(page, /Sua parte/)).toBeVisible();
  await expect(visivel(page, /deve/)).toBeVisible();

  // R15 na tela: dividir não muda o saldo (1.000,00 − 200,00).
  await page.goto("/contas");
  await expect(visivel(page, reais("800,00"))).toBeVisible();
});

test("CA-E6-55: por valores mostra Faltam/Passou, bloqueia até fechar e remove com confirmação", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c55-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c55b-${testInfo.project.name}`);
  const id = await semearDespesa(c);
  await entrar(page, c.owner);

  await page.goto(`/divisao/${id}`);
  await page.getByRole("radio", { name: "Por valores" }).click();
  const salvar = page.getByRole("button", { name: "Salvar divisão" });
  const campos = page.getByRole("textbox", { name: /^Valor de/ });
  await campos.nth(0).fill("150");
  await campos.nth(1).fill("30");
  await expect(page.getByTestId("split-difference")).toContainText("Faltam");
  await expect(salvar).toBeDisabled();
  await campos.nth(1).fill("80");
  await expect(page.getByTestId("split-difference")).toContainText("Passou");
  await campos.nth(1).fill("50");
  await expect(page.getByTestId("split-difference")).toContainText(
    "Fecha com o valor da despesa",
  );
  await expect(salvar).toBeEnabled();
  await salvar.click();

  const remover = page.getByRole("button", { name: "Remover divisão" });
  await expect(remover).toBeVisible();
  await remover.click();
  await page.getByRole("button", { name: "Remover divisão" }).last().click();
  await expect(remover).toHaveCount(0);
  await page.goto("/divisao");
  await expect(visivel(page, "Nenhuma despesa dividida")).toBeVisible();
});

test("CA-E6-59: integrante registra acerto com um lado travado nele e o saldo atualiza", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c59-${testInfo.project.name}`);
  const bruno = await criarIntegrante(c.familyId, `c59b-${testInfo.project.name}`);
  const id = await semearDespesa(c);
  await entrar(page, c.owner);
  await page.goto(`/divisao/${id}`);
  await page.getByRole("button", { name: "Salvar divisão" }).click();
  await expect(page.getByRole("button", { name: "Remover divisão" })).toBeVisible();

  await page.context().clearCookies();
  await entrar(page, bruno);
  await page.goto("/divisao");
  await expect(visivel(page, /deve/)).toBeVisible();

  await page.goto("/divisao/acertos/novo");
  await expect(page.getByRole("combobox", { name: "De (quem pagou)" })).toBeDisabled();
  await escolher(page, "Para (quem recebeu)", "Ana Souza");
  await page.getByLabel("Valor", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Salvar acerto" }).click();
  await expect(page).toHaveURL(/\/divisao\/acertos$/);
  await expect(visivel(page, "Ana Souza")).toBeVisible();

  await page.goto("/divisao");
  await expect(visivel(page, /deve/)).toBeVisible();
});

test("CA-E6-60: despesa de outra família devolve 'Página não encontrada'", async ({
  page,
}, testInfo) => {
  const a = await criarCenario(`c60a-${testInfo.project.name}`);
  const b = await criarCenario(`c60b-${testInfo.project.name}`);
  const id = await semearDespesa(a);
  await entrar(page, b.owner);
  await page.goto(`/divisao/${id}`);
  // notFound() com loading.tsx responde 200: o critério é o conteúdo.
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});

test("CA-E6-58: /divisao e /planejamento em celular sem rolagem horizontal", async ({
  page,
}, testInfo) => {
  test.skip(!/mobile|celular/i.test(testInfo.project.name), "só no projeto de celular");
  const c = await criarCenario(`c58d-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c58db-${testInfo.project.name}`);
  const id = await semearDespesa(c);
  await entrar(page, c.owner);
  await page.goto(`/divisao/${id}`);
  await page.getByRole("button", { name: "Salvar divisão" }).click();
  await expect(page.getByRole("button", { name: "Remover divisão" })).toBeVisible();

  for (const rota of ["/divisao", `/divisao/${id}`, "/divisao/acertos", "/planejamento"]) {
    await page.goto(rota);
    await expect(page.locator("main")).toBeVisible();
    const estoura = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(estoura, `rolagem horizontal em ${rota}`).toBe(false);
  }
});

test("CA-E6-57: compromisso dividido pago com valor diferente reescala as parcelas (R17)", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c57-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c57b-${testInfo.project.name}`);
  const id = await semearDespesa(c, "Luz do mês", "pending");
  await entrar(page, c.owner);

  await page.goto(`/divisao/${id}`);
  await expect(visivel(page, reais("100,00"))).toBeVisible();
  await page.getByRole("button", { name: "Salvar divisão" }).click();
  await expect(page.getByRole("button", { name: "Remover divisão" })).toBeVisible();

  await page.goto(`/compromissos/${id}`);
  await page
    .getByRole("button", { name: "Marcar como pago" })
    .filter({ visible: true })
    .first()
    .click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Valor").fill("300");
  await dialogo.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(dialogo).toHaveCount(0);

  await page.goto(`/divisao/${id}`);
  const partes = page.getByText(reais("150,00")).filter({ visible: true });
  await expect(partes.first()).toBeVisible();
  await expect(partes).toHaveCount(2);
});

test("CA-E6-62: falha de rede na divisão e no acerto mantém os valores digitados", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`c62r-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c62rb-${testInfo.project.name}`);
  const id = await semearDespesa(c);
  await entrar(page, c.owner);

  await page.goto(`/divisao/${id}`);
  await page.getByRole("radio", { name: "Por valores" }).click();
  const campos = page.getByRole("textbox", { name: /^Valor de/ });
  await campos.nth(0).fill("150");
  await campos.nth(1).fill("50");
  await page.route("**/*", (route) =>
    route.request().headers()["next-action"] ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Salvar divisão" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível" }).first(),
  ).toBeVisible();
  await expect(campos.nth(0)).toHaveValue("150,00");
  await expect(campos.nth(1)).toHaveValue("50,00");

  await page.goto("/divisao/acertos/novo");
  await escolher(page, "De (quem pagou)", "Bruno Lima");
  await escolher(page, "Para (quem recebeu)", "Ana Souza");
  await page.getByLabel("Valor", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Salvar acerto" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível" }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Valor", { exact: true })).toHaveValue("20,00");
});

test("CA-E6-62: sessão expirada na divisão leva ao login com retorno à rota", async ({
  page,
  context,
}, testInfo) => {
  const c = await criarCenario(`c62d-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c62db-${testInfo.project.name}`);
  const id = await semearDespesa(c);
  await entrar(page, c.owner);

  await page.goto(`/divisao/${id}`);
  await expect(page.getByRole("button", { name: "Salvar divisão" })).toBeEnabled();
  await context.clearCookies();
  await page.getByRole("button", { name: "Salvar divisão" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/login\\?motivo=sessao_expirada&next=%2Fdivisao%2F${id}`),
  );
});

test("CA-E6-62: sessão expirada no acerto leva ao login com retorno à rota", async ({
  page,
  context,
}, testInfo) => {
  const c = await criarCenario(`c62a-${testInfo.project.name}`);
  await criarIntegrante(c.familyId, `c62ab-${testInfo.project.name}`);
  await entrar(page, c.owner);

  await page.goto("/divisao/acertos/novo");
  await escolher(page, "De (quem pagou)", "Bruno Lima");
  await escolher(page, "Para (quem recebeu)", "Ana Souza");
  await page.getByLabel("Valor", { exact: true }).fill("20");
  await context.clearCookies();
  await page.getByRole("button", { name: "Salvar acerto" }).click();
  await expect(page).toHaveURL(
    /\/login\?motivo=sessao_expirada&next=%2Fdivisao%2Facertos%2Fnovo/,
  );
});
