import { expect, test } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  clienteDo,
  criarIntegrante,
  entrar,
  escolher,
  lancar,
} from "./helpers/cenario";

import { reais } from "./helpers/cenario";
import { adminClient } from "./helpers/users";

test("CA-E3-50: primeira conta criada em /contas/nova, saldo em /contas", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`conta50-${testInfo.project.name}`);
  await entrar(page, c.owner);
  // O /inicio é só de leitura: sem conta, mostra o estado vazio informativo e nenhum atalho de criação.
  await page.goto("/inicio");
  await expect(
    page.getByRole("heading", {
      name: "Nenhum compromisso em aberto neste período",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Cadastrar conta" }),
  ).toHaveCount(0);
  await page.goto("/contas/nova");
  await expect(page).toHaveURL(/\/contas\/nova$/);
  await page.getByLabel("Nome da conta").fill("Conta principal");
  await page.getByLabel("Saldo inicial", { exact: true }).fill("1000,00");
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
  await page.getByLabel("Fatura atual (valor devido)", { exact: true }).fill("0,00");
  await page.getByLabel(/Limite do cartão/).fill("2000,00");
  await page.getByLabel("Dia de fechamento").fill("10");
  await page.getByLabel("Dia de vencimento").fill("20");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);

  await lancar(page, {
    tipo: "Despesa",
    descricao: "Compra",
    valor: "300,00",
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
    valor: "300,00",
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

/** Data civil no fuso do app (America/Sao_Paulo), calculada aqui com Intl e Date.UTC, sem usar src/lib/dates. */
const FUSO_DO_APP = "America/Sao_Paulo";
const hojeNoApp = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: FUSO_DO_APP });

type Dia = { ano: number; mes: number; dia: number }; // mes 1..12
const dividir = (iso: string): Dia => {
  const [ano = 0, mes = 0, dia = 0] = iso.split("-").map(Number);
  return { ano, mes, dia };
};
const iso = ({ ano, mes, dia }: Dia) =>
  `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const ddmm = ({ mes, dia }: Dia) =>
  `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
const ultimoDia = (ano: number, mes: number) =>
  new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const proximoMes = ({ ano, mes }: Dia) =>
  mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
const ontemDe = (d: Dia): Dia => {
  const o = new Date(Date.UTC(d.ano, d.mes - 1, d.dia - 1));
  return {
    ano: o.getUTCFullYear(),
    mes: o.getUTCMonth() + 1,
    dia: o.getUTCDate(),
  };
};

// Vencimento fixo no dia 10: cai no mesmo mês do fechamento se o fechamento é antes do dia 10, senão no mês seguinte.
const DIA_VENCIMENTO = 10;
const vencimentoApos = (fechamento: Dia): Dia => {
  const mesDoVencimento =
    fechamento.dia < DIA_VENCIMENTO
      ? { ano: fechamento.ano, mes: fechamento.mes }
      : proximoMes(fechamento);
  return { ...mesDoVencimento, dia: DIA_VENCIMENTO };
};

test("D24/D25: compra no dia do fechamento vai para a fatura aberta; a de ontem, para a fechada; estorno total zera a aberta", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`fatura-${testInfo.project.name}`);
  const admin = adminClient();
  const hoje = dividir(hojeNoApp());
  const ontem = ontemDe(hoje);

  // Cartão com dia de fechamento = dia de hoje (29..31 viram o último dia nos meses curtos, como no app).
  const { data: cartao, error: erroCartao } = await admin
    .from("accounts")
    .insert({
      family_id: c.familyId,
      name: "Visa Fatura",
      type: "credit_card",
      opening_balance: "0",
      opening_balance_date: "2026-01-01",
      credit_limit: "5000",
      statement_closing_day: hoje.dia,
      statement_due_day: DIA_VENCIMENTO,
      created_by: c.owner.id,
    })
    .select("id")
    .single();
  if (erroCartao || !cartao)
    throw new Error(`Falha ao criar cartão: ${erroCartao?.message}`);
  const { data: categoria } = await admin
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", "Mercado")
    .single();

  const cliente = await clienteDo(c.owner);
  const compra = (descricao: string, valor: string, data: string) => ({
    family_id: c.familyId,
    type: "expense",
    account_id: cartao.id as string,
    category_id: categoria?.id as string,
    description: descricao,
    amount: valor,
    transaction_date: data,
    status: "paid",
  });
  const { data: inseridas, error: erroCompras } = await cliente
    .from("transactions")
    .insert([
      compra("Compra de hoje", "100.00", iso(hoje)),
      compra("Compra de ontem", "50.00", iso(ontem)),
    ])
    .select("id, description");
  if (erroCompras) throw new Error(erroCompras.message);
  const idHoje = inseridas?.find((t) => t.description === "Compra de hoje")?.id;
  if (!idHoje) throw new Error("Compra de hoje não foi criada.");

  // Esperado, calculado aqui: a fatura aberta fecha no mesmo dia do mês seguinte; a fechada fechou hoje.
  const proximo = proximoMes(hoje);
  const fechaAberta: Dia = {
    ...proximo,
    dia: Math.min(hoje.dia, ultimoDia(proximo.ano, proximo.mes)),
  };
  const venceAberta = vencimentoApos(fechaAberta);
  const venceFechada = vencimentoApos(hoje);

  await entrar(page, c.owner);
  await page.goto("/contas");
  const visa = page
    .locator('[data-testid="conta"]:visible')
    .filter({ hasText: "Visa Fatura" });
  const aberta = visa.locator('[data-testid="fatura-aberta"]');
  const fechada = visa.locator('[data-testid="fatura-fechada"]');

  await expect(aberta).toContainText(reais("100,00"));
  await expect(aberta).toContainText(
    `Fecha ${ddmm(fechaAberta)} · vence ${ddmm(venceAberta)}`,
  );
  await expect(fechada).toContainText(reais("50,00"));
  await expect(fechada).toContainText(`Vence ${ddmm(venceFechada)}`);
  await expect(fechada).not.toContainText("Vencida");

  // Captura opcional (E2E_FATURA_SHOT_DIR) com as duas faturas.
  const pastaCaptura = process.env.E2E_FATURA_SHOT_DIR;
  if (pastaCaptura)
    await visa.screenshot({
      path: `${pastaCaptura}/fatura-cartao-${testInfo.project.name}.png`,
    });

  // Estorno total da compra de hoje.
  const { error: erroEstorno } = await cliente.from("transactions").insert({
    ...compra("Estorno: Compra de hoje", "100.00", iso(hoje)),
    reversal_of_id: idHoje,
  });
  if (erroEstorno) throw new Error(erroEstorno.message);

  await page.goto("/contas");
  await expect(aberta).toContainText(reais("0,00"));
  await expect(fechada).toContainText(reais("50,00"));
  await expect(fechada).toContainText(`Vence ${ddmm(venceFechada)}`);
});
