import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  clienteDo,
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
  lancar,
  reais,
  type Cenario,
} from "./helpers/cenario";
import { adminClient, createUserWithFamily } from "./helpers/users";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (ano: number, mesIndice: number, dia: number) =>
  new Date(ano, mesIndice, dia).toLocaleDateString("sv-SE");
const mesPorExtenso = (ano: number, mesIndice: number) =>
  new Date(ano, mesIndice, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

function agora() {
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
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

/** Despesas efetivadas semeadas pelo cliente do dono (passam pela RLS e pelos gatilhos). */
async function semearDespesas(
  c: Cenario,
  conta: string,
  linhas: { descricao: string; valor: string; data: string }[],
) {
  const categoria = await categoriaId(c, "Mercado");
  const { error } = await (
    await clienteDo(c.owner)
  )
    .from("transactions")
    .insert(
      linhas.map((l) => ({
        family_id: c.familyId,
        type: "expense",
        account_id: conta,
        category_id: categoria,
        description: l.descricao,
        amount: l.valor,
        transaction_date: l.data,
        status: "paid",
      })),
    );
  if (error) throw new Error(error.message);
}

// `:visible` ignora a cópia oculta que o streaming do React deixa por um instante no DOM.
const tid = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]:visible`);

function card(page: Page, titulo: string): Locator {
  return page
    .locator('[data-slot="card"]:visible')
    .filter({ has: page.getByRole("heading", { name: titulo, exact: true }) });
}

/** O contêiner `role=img` do gráfico (o SVG do Recharts também expõe `img`). */
const grafico = (page: Page, titulo: string) =>
  card(page, titulo).getByRole("img").first();

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

test("CA-E4-50: sem conta, orientação sem números; com conta, saldo e gráficos vazios", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i50-${testInfo.project.name}`);
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", { name: "Cadastre sua primeira conta" }),
  ).toBeVisible();
  await expect(main).not.toContainText("R$");

  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await page.reload();
  await expect(valorDe(page, "indicador-saldo-total")).toContainText(
    reais("1.000,00"),
  );
  await expect(
    page.getByRole("heading", { name: "Registre seu primeiro lançamento" }),
  ).toBeVisible();
  await expect(card(page, "Categorias de gastos").getByRole("img")).toHaveCount(
    0,
  );
  await expect(
    card(page, "Fluxo de caixa mensal").getByRole("img"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^Sem despesas em / }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Sem movimentações nos últimos 6 meses",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nova transação" }).first(),
  ).toBeVisible();
});

test("CA-E4-51: R1 pela tela — receita, despesa e transferência no dashboard", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i51-${testInfo.project.name}`);
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

  await page.goto("/inicio");
  await expect(valorDe(page, "indicador-saldo-total")).toContainText(
    reais("1.300,00"),
  );
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

  const fluxo = card(page, "Fluxo de caixa mensal");
  await fluxo.getByRole("button", { name: "Ver tabela" }).click();
  const tabela = fluxo.getByRole("table");
  await expect(tabela).toContainText(reais("500,00"));
  await expect(tabela).toContainText(reais("200,00"));

  // A transferência aparece nas últimas transações e não mexe em receitas nem despesas.
  await expect(card(page, "Últimas transações")).toContainText("Reserva");
});

test("CA-E4-52: período na URL, personalizado pelo DatePicker e URL inválida", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i52-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  const { ano, mes } = agora();
  await page.goto("/inicio");
  const atual = tid(page, "periodo-atual");
  await expect(atual).toHaveText(mesPorExtenso(ano, mes));

  await page.getByRole("radio", { name: "Mês anterior" }).click();
  await expect(page).toHaveURL(/periodo=mes_anterior/);
  await expect(atual).toHaveText(mesPorExtenso(ano, mes - 1));
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mês anterior" })).toBeChecked();
  await expect(atual).toHaveText(mesPorExtenso(ano, mes - 1));

  await page.getByRole("radio", { name: "Este mês" }).click();
  await expect(page).not.toHaveURL(/periodo=/);
  await expect(atual).toHaveText(mesPorExtenso(ano, mes));

  await page.getByRole("radio", { name: "Personalizado" }).click();
  await page.locator("#periodo-de").click();
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString("pt-BR", {
    month: "long",
  });
  await page
    .getByRole("button", { name: new RegExp(`(^|, )1 de ${nomeMes} de`) })
    .first()
    .click();
  await page.locator("#periodo-ate").click();
  await page.getByRole("button", { name: "Hoje", exact: true }).last().click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(
    /periodo=personalizado&de=\d{4}-\d{2}-01&ate=\d{4}-\d{2}-\d{2}/,
  );
  const urlAplicada = page.url();
  await page.reload();
  await expect(page).toHaveURL(urlAplicada);
  await expect(
    page.getByRole("radio", { name: "Personalizado" }),
  ).toBeChecked();

  // "Voltar": sai e volta pelo histórico, o período continua.
  await page.getByRole("link", { name: "Contas" }).first().click();
  await expect(page).toHaveURL(/\/contas/);
  await page.goBack();
  await expect(page).toHaveURL(urlAplicada);
  await expect(
    page.getByRole("radio", { name: "Personalizado" }),
  ).toBeChecked();

  // URL inválida cai em "Este mês" sem erro.
  await page.goto("/inicio?periodo=x&de=2026-13-01");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá,");
  await expect(page.getByRole("radio", { name: "Este mês" })).toBeChecked();
  await expect(atual).toHaveText(mesPorExtenso(ano, mes));
});

test("CA-E4-53: variação em texto e sem base de comparação", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i53-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const { ano, mes } = agora();
  await semearDespesas(c, conta, [
    { descricao: "Mês passado", valor: "100.00", data: iso(ano, mes - 1, 15) },
    { descricao: "Este mês", valor: "130.00", data: iso(ano, mes, 1) },
  ]);
  await entrar(page, c.owner);
  await page.goto("/inicio");
  await expect(tid(page, "indicador-despesas")).toContainText(
    `+30,0% em relação a ${mesPorExtenso(ano, mes - 1)}`,
  );
  await expect(tid(page, "indicador-receitas")).toContainText(
    "Sem base de comparação",
  );
  await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity/);
});

test("CA-E4-54: gráficos com título, período, legenda, aria-label e Ver tabela por teclado", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i54-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const { ano, mes } = agora();
  await semearDespesas(c, conta, [
    { descricao: "Feira", valor: "100.00", data: iso(ano, mes, 1) },
  ]);
  await entrar(page, c.owner);
  await page.goto("/inicio");

  for (const [titulo, rotulo] of [
    ["Categorias de gastos", /Despesas por categoria em .*R\$\s100,00/],
    [
      "Fluxo de caixa mensal",
      /Fluxo de caixa mensal de .*despesas R\$\s100,00/,
    ],
  ] as const) {
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
    await expect(bloco.getByRole("table")).toContainText(reais("100,00"));
  }
  await expect(
    card(page, "Categorias de gastos").getByRole("list", {
      name: "Legenda: categorias de gastos",
    }),
  ).toContainText("Mercado");
});

for (const largura of [390, 360]) {
  test(`CA-E4-55: celular ${largura}px — ordem da tela 10, sem rolagem horizontal, alvos de 40px`, async ({
    page,
  }, testInfo) => {
    const c = await criarCenario(`i55-${largura}-${testInfo.project.name}`);
    const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
    const { ano, mes } = agora();
    await semearDespesas(c, conta, [
      { descricao: "Feira", valor: "100.00", data: iso(ano, mes, 1) },
    ]);
    await entrar(page, c.owner);
    await page.setViewportSize({ width: largura, height: 844 });
    await page.goto("/inicio");
    await expect(grafico(page, "Fluxo de caixa mensal")).toBeVisible();

    const ordem = [
      "Saldo total",
      "Receitas",
      "Despesas",
      "Resultado",
      "Metas",
      "Próximos vencimentos",
      "Categorias de gastos",
      "Fluxo de caixa mensal",
      "Últimas transações",
    ];
    const caixas: { x: number; y: number }[] = [];
    for (const titulo of ordem) {
      const box = await page
        .getByRole("heading", { name: titulo, exact: true })
        .boundingBox();
      expect(box, `bloco "${titulo}" visível`).not.toBeNull();
      caixas.push({ x: box?.x ?? 0, y: box?.y ?? 0 });
    }
    const [, receitas, despesas] = caixas;
    // Receitas e Despesas lado a lado; os demais empilham na ordem da tela 10.
    expect(Math.abs((receitas?.y ?? 0) - (despesas?.y ?? 0))).toBeLessThan(4);
    expect(despesas?.x ?? 0).toBeGreaterThan(receitas?.x ?? 0);
    const empilhados = [0, 2, 3, 4, 5, 6, 7, 8].map((i) => caixas[i]?.y ?? 0);
    expect(empilhados).toEqual([...empilhados].sort((a, b) => a - b));

    await semRolagemHorizontal(page, "/inicio");
    for (const titulo of ["Categorias de gastos", "Fluxo de caixa mensal"]) {
      const caixa = await grafico(page, titulo).boundingBox();
      expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(
        largura,
      );
    }
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
    expect(pequenos, "alvos < 40px").toEqual([]);

    // Filtro de período utilizável por toque, inclusive o personalizado.
    await page.getByRole("radio", { name: "Personalizado" }).click();
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();
    await semRolagemHorizontal(page, "/inicio (personalizado)");
  });
}

test("CA-E4-56: tema não altera números; escuro usa os tokens Rocket nos gráficos", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i56-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const { ano, mes } = agora();
  await semearDespesas(c, conta, [
    { descricao: "Feira", valor: "100.00", data: iso(ano, mes, 1) },
  ]);
  await entrar(page, c.owner);
  const ids = [
    "indicador-saldo-total",
    "indicador-receitas",
    "indicador-despesas",
    "indicador-resultado",
  ];
  const ler = async () => {
    await page.goto("/inicio");
    await expect(grafico(page, "Categorias de gastos")).toBeVisible();
    return Promise.all(ids.map((id) => valorDe(page, id).innerText()));
  };
  const claro = await ler();

  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Escuro" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);
  const escuro = await ler();
  expect(escuro).toEqual(claro);

  const lerCores = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--chart-3)";
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      const sector = document.querySelector('[role="img"] .recharts-sector');
      return { token, fatia: sector ? getComputedStyle(sector).fill : null };
    });
  // A fatia aparece depois da animação de entrada: espera o fill existir.
  await expect.poll(async () => (await lerCores()).fatia).not.toBeNull();
  const { fatia, token } = await lerCores();
  expect(fatia).toBe(token);
});

test("CA-E4-57: dados de uma família não aparecem para outra no mesmo navegador", async ({
  page,
}, testInfo) => {
  const a = await criarCenario(`i57a-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(a, "Corrente", "checking", "1000");
  const { ano, mes } = agora();
  await semearDespesas(a, conta, [
    { descricao: "Segredo da Ana", valor: "777.00", data: iso(ano, mes, 1) },
  ]);
  const b = await createUserWithFamily(`i57b-${testInfo.project.name}`, "Beto");
  await entrar(page, a.owner);
  await page.goto("/inicio");
  await expect(card(page, "Últimas transações")).toContainText(
    "Segredo da Ana",
  );
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/login/);

  await entrar(page, b);
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá,");
  const naoDeveAparecer = async () => {
    await expect(page.getByText("Segredo da Ana")).toHaveCount(0);
    await expect(page.getByText("Mercado")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("777,00");
  };
  await naoDeveAparecer();
  await page.goto("/contas");
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/inicio/);
  await naoDeveAparecer();
});

test("CA-E4-58: member vê os mesmos números do owner", async ({
  page,
  browser,
}, testInfo) => {
  const c = await criarCenario(`i58-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const { ano, mes } = agora();
  await semearDespesas(c, conta, [
    { descricao: "Feira", valor: "100.00", data: iso(ano, mes, 1) },
  ]);
  const member = await criarIntegrante(
    c.familyId,
    `m58-${testInfo.project.name}`,
  );
  const ids = [
    "indicador-saldo-total",
    "indicador-receitas",
    "indicador-despesas",
    "indicador-resultado",
  ];
  const ler = async (p: Page) =>
    Promise.all(ids.map((id) => valorDe(p, id).innerText()));

  await entrar(page, c.owner);
  await page.goto("/inicio");
  await expect(valorDe(page, "indicador-despesas")).toContainText(
    reais("100,00"),
  );
  const doOwner = await ler(page);

  const contexto = await browser.newContext(testInfo.project.use);
  const paginaMember = await contexto.newPage();
  await entrar(paginaMember, member);
  await paginaMember.goto("/inicio");
  await expect(valorDe(paginaMember, "indicador-despesas")).toContainText(
    reais("100,00"),
  );
  expect(await ler(paginaMember)).toEqual(doOwner);
  await expect(grafico(paginaMember, "Categorias de gastos")).toBeVisible();
  await contexto.close();
});

test("CA-E4-59: últimas transações (até 5), detalhe e Ver todas", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i59-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const { ano, mes } = agora();
  await semearDespesas(
    c,
    conta,
    Array.from({ length: 7 }, (_, i) => ({
      descricao: `Item ${pad(i + 1)}`,
      valor: "1.00",
      data: iso(ano, mes, 1),
    })),
  );
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const lista = page.getByRole("list", { name: "Últimas transações" });
  await expect(lista.getByRole("listitem")).toHaveCount(5);
  await lista.getByRole("link").first().click();
  // Navegação para a renderização do detalhe: com a suíte em paralelo passa de 10 s.
  await expect(page).toHaveURL(/\/transacoes\/[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });

  await page.goto("/inicio");
  await page.getByRole("link", { name: "Ver todas" }).click();
  await expect(page).toHaveURL(
    /\/transacoes\?de=\d{4}-\d{2}-01&ate=\d{4}-\d{2}-\d{2}/,
  );
  await expect(
    page.getByText("7 lançamentos").filter({ visible: true }),
  ).toBeVisible();
});

test("CA-E4-60: 'Como calculamos' em cada indicador", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i60-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await page.goto("/inicio");
  for (const nome of [
    "Saldo total",
    "Receitas",
    "Despesas",
    "Resultado",
    "Categorias de gastos",
    "Fluxo de caixa mensal",
  ]) {
    await page
      .getByRole("button", { name: `Como calculamos ${nome}`, exact: true })
      .click();
    const popup = page.getByText(/^Definição D\d+/);
    await expect(popup).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
  }
});

test("CA-E5-58: Próximos vencimentos mostra o compromisso e leva a /compromissos", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i58-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const vencimentos = tid(page, "proximos-vencimentos");
  await expect(vencimentos).toContainText(
    "Nenhum vencimento nos próximos 30 dias",
  );
  await expect(
    vencimentos.getByRole("link", { name: "Novo compromisso" }),
  ).toBeVisible();

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
      description: "Luz",
      amount: "80.00",
      transaction_date: new Date().toLocaleDateString("sv-SE"),
      status: "pending",
    });
  expect(error).toBeNull();

  await page.goto("/inicio");
  await expect(vencimentos).toContainText("Luz");
  await expect(vencimentos).toContainText("Vence hoje");
  await vencimentos.getByRole("link", { name: "Ver todos" }).click();
  await expect(page).toHaveURL(/\/compromissos$/);
});

// CR-frontend-2: a barra de Despesas saía preta (e o marcador da legenda sumia) depois de lançar
// pela UI e abrir /inicio em carga completa. Afirma as cores computadas contra o token da :root.
test("CR-frontend-2: fluxo de caixa usa --chart-income/--chart-expense após lançar pela UI (claro e escuro)", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i-cores-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
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

  const lerCores = async () => {
    await page.goto("/inicio");
    const fluxo = card(page, "Fluxo de caixa mensal");
    await expect(
      fluxo.locator(".recharts-bar-rectangle path").first(),
    ).toBeVisible();
    return page.evaluate(() => {
      const tokenDe = (nome: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${nome})`;
        document.body.appendChild(probe);
        const cor = getComputedStyle(probe).color;
        probe.remove();
        return cor;
      };
      const fills = Array.from(
        document.querySelectorAll(".recharts-bar-rectangle path"),
      ).map((p) => getComputedStyle(p).fill);
      const marcador = (rotulo: string) => {
        const li = Array.from(document.querySelectorAll("li")).find((l) =>
          l.textContent?.trim().startsWith(rotulo),
        );
        const span = li?.querySelector("span");
        return span ? getComputedStyle(span).backgroundColor : null;
      };
      return {
        receita: tokenDe("--chart-income"),
        despesa: tokenDe("--chart-expense"),
        fills,
        marcadorReceita: marcador("Receitas"),
        marcadorDespesa: marcador("Despesas"),
      };
    });
  };

  const claro = await lerCores();
  expect(claro.fills).toContain(claro.despesa);
  expect(claro.fills).toContain(claro.receita);
  expect(claro.fills).not.toContain("rgb(0, 0, 0)");
  expect(claro.marcadorDespesa).toBe(claro.despesa);
  expect(claro.marcadorReceita).toBe(claro.receita);

  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Escuro" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);
  const escuro = await lerCores();
  expect(escuro.fills).toContain(escuro.despesa);
  expect(escuro.fills).toContain(escuro.receita);
  expect(escuro.marcadorDespesa).toBe(escuro.despesa);
  expect(escuro.despesa).not.toBe(claro.despesa);
});

test("CA-E6-61: card Metas mostra até 3 metas com % e link; vazio oferece Criar meta", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i61-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await semearDespesas(c, conta, [
    {
      descricao: "Feira",
      valor: "10.00",
      data: iso(agora().ano, agora().mes, 1),
    },
  ]);
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const metas = card(page, "Metas");
  await expect(metas.getByText("Nenhuma meta ativa")).toBeVisible();
  await expect(metas.getByRole("link", { name: "Criar meta" })).toBeVisible();

  const cliente = await clienteDo(c.owner);
  const { error } = await cliente.from("goals").insert(
    ["Viagem", "Casa", "Carro", "Estudos"].map((name) => ({
      family_id: c.familyId,
      name,
      target_amount: "1000.00",
    })),
  );
  if (error) throw new Error(error.message);
  await page.goto("/inicio");
  await expect(metas.getByRole("listitem")).toHaveCount(3);
  await expect(metas.getByText("0%").first()).toBeVisible();
  await expect(metas.getByRole("link", { name: "Ver todas" })).toHaveAttribute(
    "href",
    "/metas",
  );
});
