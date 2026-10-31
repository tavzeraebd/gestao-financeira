import { expect, test } from "@playwright/test";

import { clienteDo, criarCenario, entrar, reais } from "./helpers/cenario";
import { adminClient } from "./helpers/users";

/**
 * ADR-0041 / D26: a despesa no cartão conta no MÊS DO VENCIMENTO da fatura em Transações (filtro de
 * período) e em Orçamentos. A data exibida na linha continua sendo a data real da compra.
 *
 * Cenário (datas no passado, porque o banco rejeita despesa paga com data futura): cartão com
 * fechamento no dia 11 e vencimento no dia 16, e um mês M já passado (dois meses atrás).
 *  - compra de cartão no dia 10 de M: fecha 11/M, vence 16/M  -> conta em M;
 *  - compra de cartão no dia 11 de M: fecha 11/M+1, vence 16/M+1 -> conta em M+1;
 *  - compra de conta corrente no dia 11 de M: conta em M (conta corrente não muda).
 *
 * Fora deste spec: o Início (/inicio). Ele só mostra o mês corrente (sem parâmetro de mês), e no mês
 * corrente não dá para semear compra de cartão que cruze a fronteira sem usar data futura ou depender
 * do dia em que o teste roda; a regra do Início é coberta pelo pgTAP/integração (dashboard).
 */

const FUSO_DO_APP = "America/Sao_Paulo";
const hojeNoApp = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: FUSO_DO_APP });

type Mes = { ano: number; mes: number }; // mes 1..12
const somarMeses = ({ ano, mes }: Mes, n: number): Mes => {
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
};
const dois = (n: number) => String(n).padStart(2, "0");
const dia = ({ ano, mes }: Mes, d: number) => `${ano}-${dois(mes)}-${dois(d)}`;
const ultimo = ({ ano, mes }: Mes) =>
  new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const br = ({ ano, mes }: Mes, d: number) => `${dois(d)}/${dois(mes)}/${ano}`;
const mesIso = ({ ano, mes }: Mes) => `${ano}-${dois(mes)}`;

type Seed = { m0: Mes; m1: Mes; c: Awaited<ReturnType<typeof criarCenario>> };

async function semear(rotulo: string): Promise<Seed> {
  const c = await criarCenario(rotulo);
  const admin = adminClient();
  const [ano = 0, mes = 0] = hojeNoApp().split("-").map(Number);
  const m0 = somarMeses({ ano, mes }, -2);
  const m1 = somarMeses(m0, 1);

  const { data: cartao, error: e1 } = await admin
    .from("accounts")
    .insert({
      family_id: c.familyId,
      name: "Visa Mes",
      type: "credit_card",
      opening_balance: "0",
      opening_balance_date: "2020-01-01",
      credit_limit: "5000",
      statement_closing_day: 11,
      statement_due_day: 16,
      created_by: c.owner.id,
    })
    .select("id")
    .single();
  if (e1 || !cartao) throw new Error(`Falha ao criar cartão: ${e1?.message}`);
  const { data: corrente, error: e2 } = await admin
    .from("accounts")
    .insert({
      family_id: c.familyId,
      name: "Corrente Mes",
      type: "checking",
      opening_balance: "0",
      opening_balance_date: "2020-01-01",
      created_by: c.owner.id,
    })
    .select("id")
    .single();
  if (e2 || !corrente) throw new Error(`Falha ao criar conta: ${e2?.message}`);
  const { data: categoria } = await admin
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", "Mercado")
    .single();

  // Lição do projeto: transações pelo cliente do usuário (RLS e gatilhos), nunca pelo admin.
  const cliente = await clienteDo(c.owner);
  const despesa = (
    conta: string,
    descricao: string,
    valor: string,
    data: string,
  ) => ({
    family_id: c.familyId,
    type: "expense",
    account_id: conta,
    category_id: categoria?.id as string,
    description: descricao,
    amount: valor,
    transaction_date: data,
    status: "paid",
  });
  const { error: e3 } = await cliente
    .from("transactions")
    .insert([
      despesa(cartao.id as string, "Cartao dia 10", "10.00", dia(m0, 10)),
      despesa(cartao.id as string, "Cartao dia 11", "20.00", dia(m0, 11)),
      despesa(corrente.id as string, "Corrente dia 11", "40.00", dia(m0, 11)),
    ]);
  if (e3) throw new Error(`Falha ao semear compras: ${e3.message}`);

  // Orçamento da categoria Mercado vigente a partir de M (feito pelo admin: o foco é a leitura).
  const { error: e4 } = await admin.from("budgets").insert({
    family_id: c.familyId,
    category_id: categoria?.id as string,
    amount_limit: "1000.00",
    start_month: dia(m0, 1),
    created_by: c.owner.id,
  });
  if (e4) throw new Error(`Falha ao criar orçamento: ${e4.message}`);
  return { m0, m1, c };
}

const periodo = (m: Mes) =>
  `/transacoes?de=${dia(m, 1)}&ate=${dia(m, ultimo(m))}`;

test("D26: em Transações, a compra do dia 11 do cartão sai do mês M e entra em M+1", async ({
  page,
}, testInfo) => {
  const { m0, m1, c } = await semear(`fatmes-tr-${testInfo.project.name}`);
  await entrar(page, c.owner);
  const linhas = () =>
    page
      .getByRole("main")
      .locator(
        "a[href^='/transacoes/']:not([href='/transacoes/nova']):visible",
      );

  // Mês M: dia 10 do cartão e dia 11 da corrente; o dia 11 do cartão fica de fora.
  await page.goto(periodo(m0));
  await expect(
    page.getByText("Cartao dia 10").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Corrente dia 11").filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Cartao dia 11")).toHaveCount(0);
  await expect(linhas()).toHaveCount(2);
  await expect(page.getByText("2 lançamentos")).toBeVisible();

  // Mês M+1: só a compra do dia 11 do cartão, exibida com a data REAL da compra.
  await page.goto(periodo(m1));
  const compra = page.getByText("Cartao dia 11").filter({ visible: true });
  await expect(compra).toBeVisible();
  await expect(page.getByText("Cartao dia 10")).toHaveCount(0);
  await expect(page.getByText("Corrente dia 11")).toHaveCount(0);
  await expect(page.getByText("1 lançamento", { exact: true })).toBeVisible();
  await expect(
    page.getByText(br(m0, 11)).filter({ visible: true }),
  ).toBeVisible();
});

test("D26: a linha da compra do dia 11 do cartão mostra a etiqueta 'Fatura <mês>/<aa>' do vencimento", async ({
  page,
}, testInfo) => {
  const { m1, c } = await semear(`fatmes-et-${testInfo.project.name}`);
  await entrar(page, c.owner);
  // Esperado calculado aqui (sem importar do src): mês abreviado pt-BR, minúsculo, sem ponto, "/" e ano com 2 dígitos.
  const mesCurto = new Date(Date.UTC(m1.ano, m1.mes - 1, 16))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "")
    .toLowerCase();
  const etiqueta = `Fatura ${mesCurto}/${String(m1.ano).slice(2)}`;
  await page.goto(periodo(m1));
  await expect(
    page.getByText(etiqueta, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});

test("D26: em Orçamentos, o realizado de M exclui a compra do dia 11 do cartão e M+1 a inclui", async ({
  page,
}, testInfo) => {
  const { m0, m1, c } = await semear(`fatmes-or-${testInfo.project.name}`);
  await entrar(page, c.owner);

  const gasto = (valor: string) =>
    new RegExp(reais(valor).source + String.raw`\s+de\s`);

  // M: cartão dia 10 (10,00) + corrente dia 11 (40,00) = 50,00. Sem os 20,00 do cartão dia 11.
  await page.goto(`/orcamentos?mes=${mesIso(m0)}`);
  const cartaoM = page
    .locator('[data-testid="orcamento"]:visible')
    .filter({ hasText: "Mercado" });
  await expect(cartaoM).toHaveCount(1);
  await expect(cartaoM).toContainText(gasto("50,00"));

  // M+1: só a compra do cartão do dia 11 (20,00).
  await page.goto(`/orcamentos?mes=${mesIso(m1)}`);
  const cartaoM1 = page
    .locator('[data-testid="orcamento"]:visible')
    .filter({ hasText: "Mercado" });
  await expect(cartaoM1).toHaveCount(1);
  await expect(cartaoM1).toContainText(gasto("20,00"));
});
