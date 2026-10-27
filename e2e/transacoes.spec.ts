import { expect, test, type Page } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
  escolher,
  lancar,
  reais,
  clienteDo,
  type Cenario,
} from "./helpers/cenario";
import { sessionFile } from "./helpers/shared-users";
import { adminClient } from "./helpers/users";

async function saldoDe(page: Page, conta: string) {
  await page.goto("/contas");
  return page
    .locator('[data-testid=\"conta\"]:visible')
    .filter({ hasText: conta });
}

async function categoriaId(c: Cenario, nome: string): Promise<string> {
  const { data } = await adminClient()
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", nome)
    .single();
  return data?.id as string;
}

async function semear(c: Cenario, conta: string, n: number, prefixo = "Item") {
  const categoria = await categoriaId(c, "Mercado");
  const linhas = Array.from({ length: n }, (_, i) => ({
    family_id: c.familyId,
    type: "expense",
    account_id: conta,
    category_id: categoria,
    description: `${prefixo} ${String(i + 1).padStart(2, "0")}`,
    amount: "1.00",
    transaction_date: "2026-09-15",
    status: "paid",
  }));
  const { data, error } = await (
    await clienteDo(c.owner)
  )
    .from("transactions")
    .insert(linhas)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => d.id as string);
}

async function preencherDespesa(page: Page, descricao: string, valor: string) {
  await page.goto("/transacoes/nova");
  await page.getByLabel("Descrição").fill(descricao);
  await escolher(page, "Categoria", "Mercado");
  await page.getByLabel("Valor").fill(valor);
  await escolher(page, "Conta ou cartão", "Corrente");
}

test("CA-E3-51: valores inválidos não salvam; despesa de 200 baixa o saldo", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t51-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await preencherDespesa(page, "Supermercado", "0");
  const casos: [string, RegExp][] = [
    ["0", /maior que zero/],
    ["", /Informe o valor/],
    ["-5", /maior que zero|negativo/],
    ["1,234.56", /vírgula/],
  ];
  for (const [invalido, mensagem] of casos) {
    await page.getByLabel("Valor").fill("");
    await page.getByLabel("Valor").fill(invalido);
    await page.getByRole("button", { name: "Salvar despesa" }).click();
    await expect(page.getByLabel("Valor")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByRole("alert").filter({ hasText: mensagem }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/transacoes\/nova$/);
  }
  const { count } = await adminClient()
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("family_id", c.familyId);
  expect(count).toBe(0);
  await page.getByLabel("Valor").fill("200");
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page).toHaveURL(/\/transacoes$/);
  await expect(
    page.getByRole("link", { name: /Supermercado/ }).first(),
  ).toBeVisible();
  await expect(await saldoDe(page, "Corrente")).toContainText(reais("800,00"));
});

test("CA-E3-52: receita, despesa e transferência (R1 pela tela)", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t52-${testInfo.project.name}`);
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
    descricao: "Aluguel",
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
  await page.goto("/contas");
  await expect(
    page
      .locator('[data-testid=\"conta\"]:visible')
      .filter({ hasText: "Corrente" }),
  ).toContainText(reais("1.200,00"));
  await expect(
    page
      .locator('[data-testid=\"conta\"]:visible')
      .filter({ hasText: "Poupança" }),
  ).toContainText(reais("100,00"));
  await expect(
    page.locator('[data-testid=\"saldo-total\"]:visible'),
  ).toContainText(reais("1.300,00"));
});

test("CA-E3-53: editar, histórico, estorno e exclusões", async ({
  page,
}, testInfo) => {
  // Fluxo longo (~15 navegações): isolado leva ~30 s e sob carga encosta nos 60 s.
  test.slow();
  const c = await criarCenario(`t53-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await lancar(page, {
    tipo: "Despesa",
    descricao: "Reforma",
    valor: "200",
    conta: "Corrente",
    categoria: "Mercado",
  });
  await page
    .getByRole("link", { name: /Reforma/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Valor").fill("250");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(/\/transacoes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByText(/Valor: R\$\s200,00 → R\$\s250,00/),
  ).toBeVisible();
  await expect(await saldoDe(page, "Corrente")).toContainText(reais("750,00"));

  await page.goto("/transacoes");
  await page
    .getByRole("link", { name: /Reforma/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByLabel("Valor a estornar").fill("50");
  await page.getByRole("button", { name: "Registrar estorno" }).click();
  await expect(
    page.getByText(/Valor ainda estornável/).locator(".."),
  ).toContainText(reais("200,00"));
  await expect(await saldoDe(page, "Corrente")).toContainText(reais("800,00"));

  await page.goto("/transacoes");
  await page
    .getByRole("link", { name: /Estorno: Reforma/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("button", { name: "Excluir lançamento" }).click();
  await expect(page).toHaveURL(/\/transacoes$/);
  await page
    .getByRole("link", { name: /Reforma/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("button", { name: "Excluir lançamento" }).click();
  await expect(page).toHaveURL(/\/transacoes$/);
  await expect(page.getByRole("link", { name: /Reforma/ })).toHaveCount(0);
  await expect(await saldoDe(page, "Corrente")).toContainText(
    reais("1.000,00"),
  );
});

test("CA-E3-54: filtros, busca, ordem e página ficam na URL", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t54-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await semear(c, conta, 25);
  await entrar(page, c.owner);
  await page.goto("/transacoes");
  await expect(
    page.getByText("25 lançamentos").filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByRole("link", { name: /Item \d\d/ })).toHaveCount(5);
  await page.reload();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(
    page.getByText("25 lançamentos").filter({ visible: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/pagina=2/);
  await expect(page.getByRole("link", { name: /Item \d\d/ })).toHaveCount(20);

  await page.goto("/transacoes");
  const busca = page.getByRole("searchbox", { name: "Buscar lançamentos" });
  await busca.fill("Item 07");
  await expect(page).toHaveURL(/q=Item/);
  await expect(
    page.getByText("1 lançamento", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await expect(busca).toHaveValue("Item 07");
  await busca.fill("zzz");
  await expect(
    page.getByRole("heading", { name: "Nenhum lançamento encontrado" }),
  ).toBeVisible();

  // Filtros combinados: busca + tipo (no celular, dentro da folha de filtros).
  await busca.fill("Item");
  await expect(
    page.getByText("25 lançamentos").filter({ visible: true }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /^Filtros/ }).click();
  }
  await escolher(page, "Tipo", "Receita");
  await expect(page).toHaveURL(/tipo=receita/);
  await expect(page).toHaveURL(/q=Item/);
  await expect(
    page.getByRole("heading", { name: "Nenhum lançamento encontrado" }),
  ).toBeVisible();
});

test("CA-E3-55: duplo clique cria um único lançamento", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t55-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "100");
  await entrar(page, c.owner);
  await preencherDespesa(page, "Duplo", "10");
  await page.getByRole("button", { name: "Salvar despesa" }).dblclick();
  await expect(page).toHaveURL(/\/transacoes$/);
  await expect(
    page.getByText("1 lançamento", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});

test("CA-E3-56: member cria, mas não gerencia lançamentos alheios", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t56-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "100");
  const [alheio] = await semear(c, conta, 1, "Alheio");
  const member = await criarIntegrante(
    c.familyId,
    `m56t-${testInfo.project.name}`,
  );
  await entrar(page, member);
  await page.goto(`/transacoes/${alheio}`);
  await expect(page.getByRole("heading", { name: "Alheio 01" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Estornar" })).toHaveCount(0);
  await expect(page.getByText("Histórico de alterações")).toHaveCount(0);
  await page.goto(`/transacoes/${alheio}/editar`);
  await expect(page.getByText(/não encontrad/i).first()).toBeVisible();
  await lancar(page, {
    tipo: "Despesa",
    descricao: "Do member",
    valor: "5",
    conta: "Corrente",
    categoria: "Mercado",
  });
});

test.describe("CA-E3-57: outra família", () => {
  test.use({ storageState: sessionFile("outsider") });
  test("detalhe de lançamento alheio: não encontrado", async ({
    page,
  }, testInfo) => {
    const c = await criarCenario(`t57-${testInfo.project.name}`);
    const conta = await criarContaNoBanco(c, "Corrente");
    const [id] = await semear(c, conta, 1);
    await page.goto(`/transacoes/${id}`);
    await expect(page.getByText(/não encontrad/i).first()).toBeVisible();
  });
});

test("CA-E3-58: celular em cartões, sem rolagem horizontal, alvos de 40px", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t58-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "100");
  await semear(c, conta, 3);
  await entrar(page, c.owner);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const rota of [
    "/transacoes",
    "/transacoes/nova",
    "/contas",
    "/categorias",
  ]) {
    await page.goto(rota);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const largo = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(largo, `${rota}: rolagem horizontal`).toBe(false);
    const pequenos = await page.evaluate(() =>
      Array.from(
        (
          document.querySelector("main") ?? document.body
        ).querySelectorAll<HTMLElement>(
          "input:not([type=hidden]):not([aria-hidden=true]), button, a[href], [role=combobox], [role=radio]",
        ),
      )
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(
          ({ box }) =>
            box.width > 0 && box.height > 0 && Math.round(box.height) < 40,
        )
        .map(
          ({ el, box }) =>
            `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(box.height)}px`,
        ),
    );
    expect(pequenos, `${rota}: alvos < 40px`).toEqual([]);
  }
  await page.goto("/transacoes");
  await expect(page.getByRole("list", { name: "Lançamentos" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "Transações" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Contas" })).toBeVisible();
});

test("CA-E3-59: falha de rede mantém os valores e mostra erro", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t59-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "100");
  await entrar(page, c.owner);
  await preencherDespesa(page, "Sem rede", "10");
  await page.route("**/*", (route) =>
    route.request().headers()["next-action"] ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível" }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Descrição")).toHaveValue("Sem rede");
  await expect(page.getByLabel("Valor")).toHaveValue("10,00");
});

test("CA-E3-60: sessão expirada leva ao login", async ({
  page,
  context,
}, testInfo) => {
  const c = await criarCenario(`t60-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "100");
  await entrar(page, c.owner);
  await preencherDespesa(page, "Expirou", "10");
  await context.clearCookies();
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page).toHaveURL(
    /\/login\?motivo=sessao_expirada&next=%2Ftransacoes%2Fnova/,
  );
});

test("calendário: setas de mês em navegador real", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`tcal-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente");
  await entrar(page, c.owner);
  await page.goto("/transacoes/nova");
  const data = page.locator("#lancamento-data");
  await expect(data).toHaveText("Hoje");
  await data.click();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  const hoje = new Date();
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 15);
  const mes = anterior.toLocaleDateString("pt-BR", { month: "long" });
  await page.getByRole("button", { name: new RegExp(`15 de ${mes}`) }).click();
  await expect(data).toHaveText(/^15\/\d{2}\/\d{4}$/);
  await data.click();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await page.getByRole("button", { name: "Hoje", exact: true }).first().click();
  await expect(data).toHaveText("Hoje");
});

test("CA-E5-59: /transacoes só mostra efetivados e tem a navegação de seções", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`t59-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "100");
  const categoria = await categoriaId(c, "Mercado");
  const { error } = await (
    await clienteDo(c.owner)
  )
    .from("transactions")
    .insert({
      family_id: c.familyId,
      type: "expense",
      account_id: conta,
      category_id: categoria,
      description: "Pendente oculto",
      amount: "10.00",
      transaction_date: new Date().toLocaleDateString("sv-SE"),
      status: "pending",
    });
  expect(error).toBeNull();
  await entrar(page, c.owner);
  await page.goto("/transacoes");
  await expect(page.getByText("Pendente oculto")).toHaveCount(0);
  const secoes = page.getByRole("navigation", {
    name: "Seções de lançamentos",
  });
  await expect(
    secoes.getByRole("link", { name: "Lançamentos" }),
  ).toHaveAttribute("aria-current", "page");
  await secoes.getByRole("link", { name: "Compromissos" }).click();
  await expect(page).toHaveURL(/\/compromissos$/);
  await expect(
    page.getByText("Pendente oculto").filter({ visible: true }).first(),
  ).toBeVisible();
});
