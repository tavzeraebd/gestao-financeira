import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  entrar,
  lancar,
  reais,
  type Cenario,
} from "./helpers/cenario";
import { adminClient } from "./helpers/users";

// `:visible` ignora a cópia oculta que o streaming do React deixa por um instante no DOM.
const tid = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]:visible`);

function card(page: Page, titulo: string): Locator {
  return page
    .locator('[data-slot="card"]:visible')
    .filter({ has: page.getByRole("heading", { name: titulo, exact: true }) });
}

const valorDe = (page: Page, testId: string) =>
  tid(page, testId).locator('[data-testid="valor"]');

async function semRolagemHorizontal(page: Page, rota: string) {
  const largo = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(largo, `${rota}: rolagem horizontal`).toBe(false);
}

/** R1: receita 500, despesa 200 (Mercado) e transferência 100 entre as duas contas. */
async function cenarioR1(label: string, page: Page): Promise<Cenario> {
  const c = await criarCenario(label);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await criarContaNoBanco(c, "Poupança", "savings");
  await entrar(page, c.owner);
  await lancar(page, {
    tipo: "Receita",
    descricao: "Salário",
    valor: "500",
    conta: "Corrente",
    categoria: "Salário",
  });
  await lancar(page, {
    tipo: "Despesa",
    descricao: "Compras",
    valor: "200",
    conta: "Corrente",
    categoria: "Mercado",
  });
  await lancar(page, {
    tipo: "Transferência",
    descricao: "Reserva",
    valor: "100",
    conta: "Corrente",
    destino: "Poupança",
  });
  return c;
}

test("CA-E7-50: visão geral (30 dias) com R1, troca de preset na URL, reload, voltar e personalizado inválido", async ({
  page,
}, testInfo) => {
  await cenarioR1(`r50-${testInfo.project.name}`, page);
  await page.goto("/relatorios");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Relatórios",
  );
  await expect(page.getByRole("radio", { name: "30 dias" })).toBeChecked();
  await expect(valorDe(page, "indicador-receitas")).toContainText(
    reais("500,00"),
  );
  await expect(valorDe(page, "indicador-despesas")).toContainText(
    reais("200,00"),
  );
  await expect(valorDe(page, "indicador-resultado")).toContainText(
    reais("300,00"),
  );
  const legenda = page.getByRole("list", {
    name: "Legenda: categorias de gastos",
  });
  await expect(legenda).toContainText("Mercado");
  await expect(legenda).toContainText("100,0%");
  await expect(
    page.getByRole("link", { name: "Ver detalhes" }),
  ).toHaveAttribute("href", "/relatorios/categorias");

  const evolucao = card(page, "Receitas x despesas por mês");
  await evolucao.getByRole("button", { name: "Ver tabela" }).click();
  await expect(evolucao.getByRole("table")).toContainText(reais("500,00"));
  await expect(evolucao.getByRole("table")).toContainText(reais("200,00"));

  await page.getByRole("radio", { name: "7 dias" }).click();
  await expect(page).toHaveURL(/periodo=7_dias/);
  await page.reload();
  await expect(page.getByRole("radio", { name: "7 dias" })).toBeChecked();

  await page
    .getByRole("navigation", { name: "Seções dos relatórios" })
    .getByRole("link", { name: "Contas", exact: true })
    .click();
  await expect(page).toHaveURL(/\/relatorios\/contas\?periodo=7_dias/);
  await page.goBack();
  await expect(page).toHaveURL(/\/relatorios\?periodo=7_dias/);
  await expect(page.getByRole("radio", { name: "7 dias" })).toBeChecked();

  // Personalizado inválido cai em 30 dias, sem erro.
  await page.goto("/relatorios?periodo=personalizado&de=2026-13-01&ate=x");
  await expect(page.getByRole("radio", { name: "30 dias" })).toBeChecked();
  await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity/);
});

test("CA-E7-51: cada gráfico tem título, período, legenda, role=img com aria-label e Ver tabela por teclado", async ({
  page,
}, testInfo) => {
  await cenarioR1(`r51-${testInfo.project.name}`, page);

  for (const [rota, titulo, rotulo] of [
    ["/relatorios", "Por categoria", /Despesas por categoria em .*R\$\s200,00/],
    [
      "/relatorios",
      "Receitas x despesas por mês",
      /Receitas e despesas por mês em .*despesas R\$\s200,00/,
    ],
    [
      "/relatorios/contas",
      "Líquido por conta",
      /Líquido por conta em .*Corrente/,
    ],
    [
      "/relatorios/integrantes",
      "Despesas por integrante",
      /Despesas por integrante em .*Total R\$\s200,00/,
    ],
  ] as const) {
    await page.goto(rota);
    const bloco = card(page, titulo);
    await expect(bloco.getByRole("heading", { name: titulo })).toBeVisible();
    await expect(
      bloco.getByRole("img", { name: rotulo }).first(),
    ).toBeVisible();
    const alternar = bloco.getByRole("button", { name: "Ver tabela" });
    await expect(alternar).toHaveAttribute("aria-expanded", "false");
    await alternar.focus();
    await page.keyboard.press("Enter");
    await expect(
      bloco.getByRole("button", { name: "Ver gráfico" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(bloco.getByRole("table")).toBeVisible();
  }
});

test("CA-E7-52: contas com os valores de R20 e a nota; integrantes com Total = despesas e Família (sem responsável)", async ({
  page,
}, testInfo) => {
  await cenarioR1(`r52-${testInfo.project.name}`, page);

  await page.goto("/relatorios/contas");
  const corrente = page
    .getByTestId("linha-conta")
    .filter({ hasText: "Corrente" });
  // Corrente: 1000 + 500 − 200 − 100 = 1.200; entradas 500, saídas 300 (inclui a transferência).
  await expect(corrente).toContainText(reais("1.000,00"));
  await expect(corrente).toContainText(reais("500,00"));
  await expect(corrente).toContainText(reais("300,00"));
  await expect(corrente).toContainText(reais("1.200,00"));
  await expect(
    page.getByTestId("linha-conta").filter({ hasText: "Poupança" }),
  ).toContainText(reais("100,00"));
  await expect(page.getByTestId("nota-transferencias")).toHaveText(
    "Transferências entre contas aparecem aqui. No saldo total elas se anulam.",
  );
  // Variação do saldo total = receitas − despesas (a transferência se anula).
  await expect(page.getByTestId("variacao-saldo-total")).toContainText(
    reais("300,00"),
  );

  await page.goto("/relatorios/integrantes");
  await expect(page.getByTestId("total-integrantes")).toContainText(
    reais("200,00"),
  );
  await expect(page.getByTestId("linha-integrante").first()).toContainText(
    /Família \(sem responsável\)|Ana Souza/,
  );
  await expect(page.getByTestId("nota-integrantes")).toContainText(
    "Despesas divididas entram pela parte de cada um",
  );
});

test("categorias: despesas e receitas por ?tipo=, com variação em texto", async ({
  page,
}, testInfo) => {
  await cenarioR1(`rcat-${testInfo.project.name}`, page);
  await page.goto("/relatorios/categorias");
  await expect(page.getByRole("radio", { name: "Despesas" })).toBeChecked();
  const mercado = page
    .getByTestId("linha-categoria")
    .filter({ hasText: "Mercado" });
  await expect(mercado).toContainText(reais("200,00"));
  await expect(mercado).toContainText("Sem base de comparação");

  await page.getByRole("radio", { name: "Receitas" }).click();
  await expect(page).toHaveURL(/tipo=receitas/);
  await expect(
    page.getByTestId("linha-categoria").filter({ hasText: "Salário" }),
  ).toContainText(reais("500,00"));
  await page.reload();
  await expect(page.getByRole("radio", { name: "Receitas" })).toBeChecked();
  await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity/);
});

test("CA-E7-53: orçamentos e metas com ProgressMeter e estado em Badge; vazios com ação", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`r53-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);

  // Vazios: o owner vê a ação de criar.
  await page.goto("/relatorios/orcamentos");
  await expect(
    page.getByRole("link", { name: "Criar orçamento" }),
  ).toBeVisible();
  await page.goto("/relatorios/metas");
  await expect(page.getByRole("link", { name: "Criar meta" })).toBeVisible();

  const admin = adminClient();
  const { data: categoria } = await admin
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", "Mercado")
    .single();
  const mes = new Date().toLocaleDateString("sv-SE").slice(0, 7);
  const { error: erroOrcamento } = await admin.from("budgets").insert({
    family_id: c.familyId,
    category_id: categoria?.id,
    amount_limit: "100.00",
    start_month: `${mes}-01`,
    created_by: c.owner.id,
  });
  expect(erroOrcamento).toBeNull();
  const { error: erroMeta } = await admin.from("goals").insert({
    family_id: c.familyId,
    created_by: c.owner.id,
    name: "Viagem",
    icon: "plane",
    target_amount: "1000.00",
  });
  expect(erroMeta).toBeNull();

  await page.goto("/relatorios/orcamentos?periodo=3_meses");
  const linha = page.getByTestId("linha-orcamento").first();
  await expect(linha).toContainText("Mercado");
  await expect(linha).toContainText("Dentro do limite");
  await expect(linha.getByRole("progressbar")).toBeVisible();

  await page.goto("/relatorios/metas");
  const meta = page.getByTestId("meta-relatorio").first();
  await expect(meta).toContainText("Viagem");
  await expect(meta).toContainText("Aportes no período");
  await expect(meta).toContainText("Retiradas no período");
  await expect(meta.getByRole("progressbar")).toBeVisible();
});

test("visão geral vazia: orientação e Nova transação, sem números", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`r-vazio-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await page.goto("/relatorios");
  await expect(
    page.getByRole("heading", { name: /^Sem movimentações em / }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nova transação" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity/);
});

for (const largura of [390, 360]) {
  test(`CA-E7-60: celular ${largura}px — SubNav rola no trilho, gráficos cabem, sem rolagem horizontal`, async ({
    page,
  }, testInfo) => {
    await cenarioR1(`r60-${largura}-${testInfo.project.name}`, page);
    await page.setViewportSize({ width: largura, height: 844 });

    for (const rota of [
      "/relatorios",
      "/relatorios/categorias",
      "/relatorios/contas",
      "/relatorios/integrantes",
      "/relatorios/orcamentos",
      "/relatorios/metas",
    ]) {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Relatórios",
      );
      await expect(
        page.getByRole("navigation", { name: "Seções dos relatórios" }),
      ).toBeVisible();
      await semRolagemHorizontal(page, rota);
      for (const grafico of await page
        .locator('main [role="img"]:visible')
        .all()) {
        const caixa = await grafico.boundingBox();
        expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(
          largura,
        );
      }
    }

    // Filtro por toque, inclusive o personalizado, também sem rolagem horizontal.
    await page.goto("/relatorios");
    await page.getByRole("radio", { name: "Personalizado" }).click();
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();
    await semRolagemHorizontal(page, "/relatorios (personalizado)");
  });
}
