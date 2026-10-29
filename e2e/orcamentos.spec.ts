import { expect, test } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
  escolher,
  lancar,
  reais,
} from "./helpers/cenario";
import { adminClient } from "./helpers/users";

test("CA-E5-56: criar orçamento, atenção aos 80%, limite estourado e arquivar", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`orc56-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "5000");
  await entrar(page, c.owner);

  await page.goto("/orcamentos");
  await expect(
    page.getByRole("heading", { name: /Nenhum orçamento para/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Criar orçamento" }).click();
  await expect(page).toHaveURL(/\/orcamentos\/novo$/);
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Limite mensal").fill("500");
  await page.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(page).toHaveURL(/\/orcamentos$/);

  await lancar(page, {
    tipo: "Despesa",
    descricao: "Feira",
    valor: "400",
    conta: "Corrente",
    categoria: "Mercado",
  });
  await page.goto("/orcamentos");
  const card = page
    .getByTestId("orcamento")
    .filter({ visible: true })
    .filter({ hasText: "Mercado" });
  await expect(card).toContainText(reais("400,00"));
  await expect(card).toContainText(reais("500,00"));
  await expect(card).toContainText("80%");
  await expect(card).toContainText("Atenção");
  await expect(card).toContainText(/Disponível\s+R\$[\s ]100,00/);
  await expect(card.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "80% do limite",
  );

  await lancar(page, {
    tipo: "Despesa",
    descricao: "Festa",
    valor: "150",
    conta: "Corrente",
    categoria: "Mercado",
  });
  await page.goto("/orcamentos");
  await expect(card).toContainText("Limite estourado");
  await expect(card).toContainText(/Acima do limite em\s+R\$[\s ]50,00/);

  // Duplicidade: segundo orçamento ativo da mesma categoria.
  await page.goto("/orcamentos/novo");
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Limite mensal").fill("100");
  await page.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(page.getByText(/Já existe um orçamento ativo/)).toBeVisible();
  await expect(page.getByLabel("Limite mensal")).toHaveValue("100,00");

  await page.goto("/orcamentos");
  await page
    .getByRole("button", { name: "Arquivar orçamento Mercado" })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Arquivar orçamento", exact: true })
    .last()
    .click();
  await expect(
    page.getByTestId("orcamento").filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Arquivados" }).click();
  await expect(card).toBeVisible();
  await page
    .getByRole("button", { name: "Reativar orçamento Mercado" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByTestId("orcamento").filter({ visible: true }),
  ).toHaveCount(0);
});

test("categoria arquivada mostra o selo e edição mantém categoria travada", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`orc-arq-${testInfo.project.name}`);
  const admin = adminClient();
  const { data: cat } = await admin
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", "Mercado")
    .single();
  const { data: orc, error } = await admin
    .from("budgets")
    .insert({
      family_id: c.familyId,
      category_id: cat?.id,
      amount_limit: "300",
      start_month: new Date().toISOString().slice(0, 7) + "-01",
      created_by: c.owner.id,
    })
    .select("id")
    .single();
  if (error || !orc)
    throw new Error(`Falha ao criar orçamento: ${error?.message}`);
  await admin
    .from("categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", cat?.id);

  await entrar(page, c.owner);
  await page.goto("/orcamentos");
  await expect(
    page.getByText("Categoria arquivada").filter({ visible: true }).first(),
  ).toBeVisible();
  await page.goto(`/orcamentos/${orc.id}/editar`);
  await expect(page.getByLabel("Categoria", { exact: true })).toBeDisabled();
  await page.getByLabel("Limite mensal").fill("350");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(/\/orcamentos$/);
  await expect(
    page.getByTestId("orcamento").filter({ visible: true }),
  ).toContainText(reais("350,00"));
});

test("CA-E5-57/60: integrante só vê; outsider não encontra a edição", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`orc57-${testInfo.project.name}`);
  const admin = adminClient();
  const { data: orc, error } = await admin
    .from("budgets")
    .insert({
      family_id: c.familyId,
      category_id: null,
      amount_limit: "800",
      start_month: new Date().toISOString().slice(0, 7) + "-01",
      created_by: c.owner.id,
    })
    .select("id")
    .single();
  if (error || !orc)
    throw new Error(`Falha ao criar orçamento: ${error?.message}`);

  const member = await criarIntegrante(
    c.familyId,
    `orc57m-${testInfo.project.name}`,
  );
  await entrar(page, member);
  await page.goto("/orcamentos");
  await expect(
    page.getByTestId("orcamento").filter({ visible: true }),
  ).toContainText("Todas as despesas");
  await expect(page.getByRole("link", { name: "Novo orçamento" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /^Editar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Arquivar/ })).toHaveCount(0);
  await page.goto("/orcamentos/novo");
  await expect(page.getByText(/não encontrada/i).first()).toBeVisible();

  await page.context().clearCookies();
  const outro = await criarCenario(`orc60b-${testInfo.project.name}`);
  await entrar(page, outro.owner);
  await page.goto(`/orcamentos/${orc.id}/editar`);
  await expect(page.getByText(/não encontrada/i).first()).toBeVisible();
  await page.goto("/orcamentos");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
