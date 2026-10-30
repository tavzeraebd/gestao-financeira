import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  clienteDo,
  criarCenario,
  criarContaNoBanco,
  entrar,
  reais,
  type Cenario,
} from "./helpers/cenario";
import { adminClient, createUserWithFamily } from "./helpers/users";

async function categoriaId(c: Cenario, nome: string): Promise<string> {
  const { data } = await adminClient()
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", nome)
    .single();
  return data?.id as string;
}

/** Compromissos em aberto (pending) semeados pelo cliente do dono (passam pela RLS e pelos gatilhos). */
async function semearPendentes(
  c: Cenario,
  conta: string,
  linhas: { descricao: string; valor: string; data: string; tipo?: string }[],
) {
  const categoria = await categoriaId(c, "Mercado");
  const { error } = await (
    await clienteDo(c.owner)
  )
    .from("transactions")
    .insert(
      linhas.map((l) => ({
        family_id: c.familyId,
        type: l.tipo ?? "expense",
        account_id: conta,
        category_id: categoria,
        description: l.descricao,
        amount: l.valor,
        transaction_date: l.data,
        status: "pending",
      })),
    );
  if (error) throw new Error(error.message);
}

const hoje = () => new Date().toLocaleDateString("sv-SE");

/** Dia 15 do mês seguinte: fora do mês corrente, dentro da janela de 12 meses do gráfico mensal. */
const mesQueVem = () => {
  const agora = new Date();
  return new Date(
    agora.getFullYear(),
    agora.getMonth() + 1,
    15,
  ).toLocaleDateString("sv-SE");
};

// `:visible` ignora a cópia oculta que o streaming do React deixa por um instante no DOM.
const tid = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]:visible`);

function card(page: Page, titulo: string): Locator {
  return page
    .locator('[data-slot="card"]:visible')
    .filter({ has: page.getByRole("heading", { name: titulo, exact: true }) });
}

async function semRolagemHorizontal(page: Page, rota: string) {
  const largo = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(largo, `${rota}: rolagem horizontal`).toBe(false);
}

test("/inicio sem compromissos: estados vazios informativos e nenhum atalho de criação", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i50-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", {
      name: "Nenhum compromisso em aberto neste período",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Nenhum compromisso por categoria neste mês",
    }),
  ).toBeVisible();
  // Sem gráfico desenhado: o <main> inclui o cabeçalho, que no celular tem o logo (role=img "Núcleo"),
  // por isso a asserção mira só os gráficos do comprometimento.
  await expect(main.getByRole("img", { name: /Comprometimento/ })).toHaveCount(
    0,
  );
  await expect(tid(page, "indicador-saldo-total")).toContainText(
    reais("1.000,00"),
  );
  for (const nome of [
    "Nova transação",
    "Novo compromisso",
    "Criar meta",
    "Cadastrar conta",
  ]) {
    await expect(main.getByRole("link", { name: nome })).toHaveCount(0);
  }
  await expect(main.locator('a[href$="/nova"], a[href$="/novo"]')).toHaveCount(
    0,
  );
});

test("/inicio com compromisso: resumo, gráficos com resumo textual e Ver tabela", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i51-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await semearPendentes(c, conta, [
    { descricao: "Luz", valor: "80.00", data: hoje() },
  ]);
  await entrar(page, c.owner);
  await page.goto("/inicio");

  // Saldo atual (conta de R$ 1.000,00) em primeiro lugar e saldo projetado no fim do mês (1.000 - 80).
  await expect(tid(page, "indicador-saldo-total")).toContainText("Saldo atual");
  await expect(tid(page, "indicador-saldo-total")).toContainText(
    reais("1.000,00"),
  );
  await expect(tid(page, "resumo-saldo-fim-do-mes")).toContainText(
    reais("920,00"),
  );
  await expect(tid(page, "alerta-saldo-negativo")).toHaveCount(0);
  // Só os quatro cards do mês corrente: os de horizonte saíram.
  await expect(tid(page, "resumo-total-comprometido")).toHaveCount(0);
  await expect(tid(page, "resumo-mes-mais-pesado")).toHaveCount(0);
  await expect(tid(page, "resumo-menor-saldo-projetado")).toHaveCount(0);
  await expect(tid(page, "resumo-mes-atual")).toContainText(reais("80,00"));
  await expect(tid(page, "resumo-proximo-vencimento")).toContainText("Luz");

  const mensal = card(page, "Comprometimento mensal");
  await expect(
    mensal.getByRole("img", { name: /Comprometimento mensal de .*R\$\s80,00/ }),
  ).toBeVisible();
  const alternar = mensal.getByRole("button", { name: "Ver tabela" });
  await alternar.focus();
  await page.keyboard.press("Enter");
  await expect(mensal.getByRole("table")).toContainText(reais("80,00"));

  await expect(
    card(page, "Comprometimento por categoria").getByRole("list", {
      name: "Legenda: comprometimento por categoria",
    }),
  ).toContainText("Mercado");

  // O card "Próximos vencimentos" saiu: o vencimento aparece no card-resumo e o mês abre com as contas em aberto.
  await expect(tid(page, "proximos-vencimentos")).toHaveCount(0);
  await tid(page, "resumo-mes-atual").getByRole("button").click();
  const detalhe = page.getByRole("dialog");
  await expect(detalhe.getByTestId("detalhe-mes")).toContainText("Luz");
});

test("/inicio com compromisso maior que o saldo: saldo projetado negativo sinalizado em texto", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i53-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "100");
  await semearPendentes(c, conta, [
    { descricao: "Reforma", valor: "300.00", data: hoje() },
  ]);
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const menor = tid(page, "resumo-saldo-fim-do-mes");
  await expect(menor).toContainText("Saldo negativo no fim de");
  await expect(menor).toContainText("200,00");
  // O aviso fixo saiu da tela: o saldo negativo fica no card e no detalhe do mês.
  await expect(tid(page, "alerta-saldo-negativo")).toHaveCount(0);
});

test("sem seletor de horizonte: ?horizonte= é ignorado e o mês seguinte só aparece no gráfico mensal", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i52-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await semearPendentes(c, conta, [
    { descricao: "Internet", valor: "50.00", data: mesQueVem() },
  ]);
  await entrar(page, c.owner);
  await page.goto("/inicio?horizonte=6");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá,");
  await expect(
    page.getByRole("navigation", { name: "Horizonte do acompanhamento" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^\d+ meses$/ })).toHaveCount(0);

  // Gráfico mensal (mês atual + 12) enxerga o mês seguinte...
  await expect(
    card(page, "Comprometimento mensal").getByRole("img", {
      name: /Comprometimento mensal de .*R\$\s50,00/,
    }),
  ).toBeVisible();
  // ...mas cards, rosca e próximos vencimentos são só do mês corrente.
  await expect(tid(page, "resumo-mes-atual")).toContainText(reais("0,00"));
  await expect(tid(page, "resumo-proximo-vencimento")).toContainText("—");
  await expect(tid(page, "resumo-saldo-fim-do-mes")).toContainText(
    reais("1.000,00"),
  );
  await expect(
    page.getByRole("heading", {
      name: "Nenhum compromisso por categoria neste mês",
    }),
  ).toBeVisible();
  await expect(tid(page, "proximos-vencimentos")).toHaveCount(0);
  await expect(tid(page, "resumo-proximo-vencimento")).not.toContainText(
    "Internet",
  );
});

for (const largura of [390, 320]) {
  test(`celular ${largura}px: sem rolagem horizontal e alvos de 40px`, async ({
    page,
  }, testInfo) => {
    const c = await criarCenario(`i55-${largura}-${testInfo.project.name}`);
    const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
    await semearPendentes(c, conta, [
      { descricao: "Luz", valor: "80.00", data: hoje() },
    ]);
    await entrar(page, c.owner);
    await page.setViewportSize({ width: largura, height: 844 });
    await page.goto("/inicio");
    await expect(
      card(page, "Comprometimento mensal").getByRole("img").first(),
    ).toBeVisible();
    await semRolagemHorizontal(page, "/inicio");
    const pequenos = await page.evaluate(() =>
      Array.from(
        (
          document.querySelector("main") ?? document.body
        ).querySelectorAll<HTMLElement>("button, a[href]"),
      )
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(
          ({ el, box }) =>
            box.width > 0 &&
            box.height > 0 &&
            Math.round(box.height) < 40 &&
            // ⓘ (InfoHint): ícone de 20px com área de toque de 40px por pseudo-elemento (::after).
            !/^(Mais informações sobre|Como calculamos)/.test(
              el.getAttribute("aria-label") ?? "",
            ),
        )
        .map(
          ({ el, box }) =>
            `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(box.height)}px`,
        ),
    );
    expect(pequenos, "alvos < 40px").toEqual([]);
  });
}

test("dados de uma família não aparecem para outra no mesmo navegador", async ({
  page,
}, testInfo) => {
  const a = await criarCenario(`i57a-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(a, "Corrente", "checking", "1000");
  await semearPendentes(a, conta, [
    { descricao: "Segredo da Ana", valor: "777.00", data: hoje() },
  ]);
  const b = await createUserWithFamily(`i57b-${testInfo.project.name}`, "Beto");
  await entrar(page, a.owner);
  await page.goto("/inicio");
  await expect(tid(page, "resumo-proximo-vencimento")).toContainText(
    "Segredo da Ana",
  );
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/login/);

  await entrar(page, b);
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá,");
  await expect(page.getByText("Segredo da Ana")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("777,00");
});

test("Próximo vencimento: vazio informativo e o detalhe do mês lista as contas por vencimento", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`i58-${testInfo.project.name}`);
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);
  await page.goto("/inicio");
  const proximo = tid(page, "resumo-proximo-vencimento");
  await expect(proximo).toContainText("Nenhum vencimento em aberto neste mês");
  await expect(proximo.getByRole("link")).toHaveCount(0);

  const agora = new Date();
  const fimDoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
  await semearPendentes(c, conta, [
    {
      descricao: "Internet",
      valor: "50.00",
      data: fimDoMes.toLocaleDateString("sv-SE"),
    },
    { descricao: "Luz", valor: "80.00", data: hoje() },
  ]);
  await page.goto("/inicio");
  await expect(proximo).toContainText("Luz");
  await tid(page, "resumo-mes-atual").getByRole("button").click();
  const itens = page
    .getByRole("dialog")
    .getByTestId("detalhe-mes")
    .getByRole("link");
  const nomes = await itens.allTextContents();
  expect(nomes.indexOf("Luz")).toBeGreaterThanOrEqual(0);
  expect(nomes.indexOf("Luz")).toBeLessThanOrEqual(nomes.indexOf("Internet"));
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`desktop ${viewport.width}x${viewport.height}: o início cabe na tela, sem rolagem da página`, async ({
    page,
  }, testInfo) => {
    const c = await criarCenario(
      `i60-${viewport.width}-${testInfo.project.name}`,
    );
    const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
    await semearPendentes(c, conta, [
      { descricao: "Luz", valor: "80.00", data: hoje() },
      { descricao: "Internet", valor: "50.00", data: mesQueVem() },
    ]);
    await entrar(page, c.owner);
    await page.setViewportSize(viewport);
    await page.goto("/inicio");
    await expect(
      card(page, "Comprometimento mensal").getByRole("img").first(),
    ).toBeVisible();
    // No máximo quatro cards-resumo, todos na mesma linha.
    const cards = page.locator(
      '[data-testid^="resumo-"]:visible, [data-testid="indicador-saldo-total"]:visible',
    );
    await expect(cards).toHaveCount(3 + 1);
    const topos = await cards.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(new Set(topos).size, "cards em linhas diferentes").toBe(1);
    const sobra = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(sobra, "rolagem vertical da página (px)").toBeLessThanOrEqual(0);
    await semRolagemHorizontal(page, "/inicio");
  });
}
