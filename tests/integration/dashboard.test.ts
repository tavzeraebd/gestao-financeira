import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, redirectOf } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, addMonths, startOfMonth, today } from "@/lib/dates";
import { asCents, sumCents } from "@/lib/money";
import { createCategory } from "@/modules/categories/actions";
import { getDashboard } from "@/modules/reports/queries";
import { dashboardFiltersSchema } from "@/modules/reports/schemas";
import {
  createTransaction,
  deleteTransaction,
  reverseTransaction,
} from "@/modules/transactions/actions";
import {
  getPeriodSummary,
  listRecentTransactions,
} from "@/modules/transactions/queries";
import { createLoneUser, createTestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

const c = asCents;
const filters = (raw: Record<string, string> = {}) =>
  dashboardFiltersSchema.parse(raw);

const TODAY = today();
const THIS_MONTH = startOfMonth(TODAY);
const PREV_MONTH = addMonths(THIS_MONTH, -1);
const PREV_DAY = addDays(PREV_MONTH, 4); // dia 5 do mês anterior

async function mkCategory(name: string, parentId?: string): Promise<string> {
  const result = await createCategory({
    name,
    type: "expense",
    color: "chart-2",
    icon: "gift",
    parentId,
  });
  if (!result.ok) throw new Error(`createCategory falhou: ${result.error.code}`);
  return result.data.id;
}

describe("dashboard: regressão R1, variação, saldo e estados", () => {
  let fam: Awaited<ReturnType<typeof createTestFamily>>;
  let checking: string;

  beforeAll(async () => {
    fam = await createTestFamily("dash-r1");
    checking = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    const savings = await mkAccount(fam.owner, "Poupança", { type: "savings" });
    const expenseCat = await defaultCategoryId(fam.owner, "expense", "Moradia");
    const incomeCat = await defaultCategoryId(fam.owner, "income", "Salário");
    await mkTx(fam.owner, {
      type: "income",
      amount: "500,00",
      transactionDate: TODAY,
      accountId: checking,
      categoryId: incomeCat,
    });
    await mkTx(fam.owner, {
      amount: "200,00",
      transactionDate: TODAY,
      accountId: checking,
      categoryId: expenseCat,
    });
    actAs(fam.owner);
    const transfer = await createTransaction({
      type: "transfer",
      description: "Reserva",
      amount: "100,00",
      transactionDate: TODAY,
      accountId: checking,
      destinationAccountId: savings,
      idempotencyKey: randomUUID(),
    });
    if (!transfer.ok) throw new Error("transferência falhou");
  });

  it("R1 no mês atual (CA-E4-34): saldo, receitas, despesas, resultado, fluxo e recentes", async () => {
    actAs(fam.owner);
    const d = await getDashboard(filters());
    expect(d.state).toBe("ready");
    expect(d.period.preset).toBe("mes_atual");
    expect(d.consolidated).toEqual({
      current: c(130000),
      previous: c(100000), // saldo inicial entra nas duas datas (D3)
      delta: c(30000),
      percent: 30,
    });
    expect(d.income).toEqual({
      current: c(50000),
      previous: c(0),
      delta: c(50000),
      percent: null, // período anterior vazio: sem base de comparação
    });
    expect(d.expense.current).toBe(c(20000));
    expect(d.expense.percent).toBeNull();
    expect(d.result.current).toBe(c(30000));
    expect(d.openCardDebt).toBe(c(0));
    expect(d.hasCreditCards).toBe(false);
    expect(d.expenseByCategory.total).toBe(c(20000));
    expect(d.expenseByCategory.slices).toHaveLength(1);
    expect(d.expenseByCategory.slices[0]).toMatchObject({
      name: "Moradia",
      amount: c(20000),
      percent: 100,
    });
    expect(d.recentTransactions).toHaveLength(3); // inclui a transferência
    expect(d.recentTransactions.map((t) => t.type).sort()).toEqual([
      "expense",
      "income",
      "transfer",
    ]);
  });

  it("fluxo de caixa: 6 meses (R11), o último é o mês atual e a soma bate com period_summary", async () => {
    actAs(fam.owner);
    const d = await getDashboard(filters());
    const { months, from, to } = d.cashFlow;
    expect(months).toHaveLength(6);
    expect(months[0]?.month).toBe(addMonths(THIS_MONTH, -5));
    expect(months[5]?.month).toBe(THIS_MONTH);
    expect(months[5]).toMatchObject({ income: c(50000), expense: c(20000) });
    expect(months.slice(0, 5).every((m) => m.income === c(0))).toBe(true);
    expect(months[5]?.label).toMatch(/\.$/);

    const summary = await getPeriodSummary(from, to);
    expect(sumCents(months.map((m) => m.income))).toBe(summary.income);
    expect(sumCents(months.map((m) => m.expense))).toBe(summary.expense);
    expect(sumCents(months.map((m) => m.result))).toBe(summary.result);
  });

  it("member vê os mesmos números do owner", async () => {
    actAs(fam.owner);
    const a = await getDashboard(filters());
    actAs(fam.member);
    const b = await getDashboard(filters());
    expect(b.consolidated).toEqual(a.consolidated);
    expect(b.income).toEqual(a.income);
    expect(b.cashFlow.months).toEqual(a.cashFlow.months);
  });

  it("cartão fica fora do saldo consolidado; fatura em aberto entra em openCardDebt (D3/D8)", async () => {
    const family = await createTestFamily("dash-card");
    await mkAccount(family.owner, "Corrente", { openingBalance: "1.000,00" });
    const card = await mkAccount(family.owner, "Cartão", {
      type: "credit_card",
      statementClosingDay: 10,
      statementDueDay: 20,
    });
    const cat = await defaultCategoryId(family.owner, "expense", "Compras");
    await mkTx(family.owner, {
      amount: "300,00",
      transactionDate: TODAY,
      accountId: card,
      categoryId: cat,
    });
    const d = await getDashboard(filters());
    expect(d.consolidated.current).toBe(c(100000));
    expect(d.openCardDebt).toBe(c(30000));
    expect(d.hasCreditCards).toBe(true);
    expect(d.expense.current).toBe(c(30000));
  });

  it("variação com divisão por zero: anterior 0 e atual 0 -> percent null", async () => {
    const family = await createTestFamily("dash-zero");
    const acc = await mkAccount(family.owner, "Corrente");
    const cat = await defaultCategoryId(family.owner, "expense", "Moradia");
    await mkTx(family.owner, {
      amount: "10,00",
      transactionDate: addDays(addMonths(THIS_MONTH, -2), 4),
      accountId: acc,
      categoryId: cat,
    });
    const d = await getDashboard(filters());
    expect(d.expense).toEqual({
      current: c(0),
      previous: c(0),
      delta: c(0),
      percent: null,
    });
    expect(d.state).toBe("ready"); // há lançamento efetivado na história
    expect(d.expenseByCategory.slices).toEqual([]);
    expect(d.recentTransactions).toEqual([]);
  });
});

describe("dashboard: filtros de período", () => {
  let fam: Awaited<ReturnType<typeof createTestFamily>>;

  beforeAll(async () => {
    fam = await createTestFamily("dash-per");
    const acc = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "100,00",
    });
    const cat = await defaultCategoryId(fam.owner, "expense", "Moradia");
    await mkTx(fam.owner, {
      amount: "80,00",
      transactionDate: PREV_DAY,
      accountId: acc,
      categoryId: cat,
    });
    await mkTx(fam.owner, {
      amount: "20,00",
      transactionDate: TODAY,
      accountId: acc,
      categoryId: cat,
    });
  });

  it("Mês anterior: período, comparação com o mês anterior a ele e saldo no fim do mês", async () => {
    actAs(fam.owner);
    const d = await getDashboard(filters({ periodo: "mes_anterior" }));
    expect(d.period.preset).toBe("mes_anterior");
    expect(d.period.from).toBe(PREV_MONTH);
    expect(d.asOf).toBe(addDays(THIS_MONTH, -1));
    expect(d.expense).toMatchObject({ current: c(8000), previous: c(0) });
    expect(d.consolidated.current).toBe(c(2000)); // 100 - 80
    expect(d.recentTransactions).toHaveLength(1);
  });

  it("Este mês: saldo até hoje; mês anterior em D4", async () => {
    actAs(fam.owner);
    const d = await getDashboard(filters());
    expect(d.asOf).toBe(TODAY);
    expect(d.expense).toMatchObject({
      current: c(2000),
      previous: c(8000),
      delta: c(-6000),
      percent: -75,
    });
    expect(d.consolidated.current).toBe(c(0));
    expect(d.consolidated.previous).toBe(c(2000));
  });

  it("Personalizado válido: usa o intervalo e os N dias anteriores", async () => {
    actAs(fam.owner);
    const de = addDays(PREV_DAY, -2);
    const ate = addDays(PREV_DAY, 2);
    const d = await getDashboard(filters({ periodo: "personalizado", de, ate }));
    expect(d.period).toMatchObject({
      preset: "personalizado",
      from: de,
      to: ate,
      previousTo: addDays(de, -1),
    });
    expect(d.expense).toMatchObject({ current: c(8000), previous: c(0) });
  });

  it("Personalizado inválido (invertido, > 366 dias, sem datas) cai em Este mês", async () => {
    actAs(fam.owner);
    const invalid: Record<string, string>[] = [
      { periodo: "personalizado", de: TODAY, ate: addDays(TODAY, -3) },
      {
        periodo: "personalizado",
        de: addDays(TODAY, -400),
        ate: TODAY,
      },
      { periodo: "personalizado" },
      { periodo: "lixo" },
    ];
    for (const raw of invalid) {
      const d = await getDashboard(filters(raw));
      expect(d.period.preset).toBe("mes_atual");
      expect(d.period.from).toBe(THIS_MONTH);
    }
  });
});

describe("dashboard: despesas por categoria (D16)", () => {
  it("6 categorias -> 6 fatias; 7 -> 5 maiores + Outras categorias; subcategoria soma à pai", async () => {
    const family = await createTestFamily("dash-cat");
    const acc = await mkAccount(family.owner, "Corrente", {
      openingBalance: "10.000,00",
    });
    actAs(family.owner);
    const cats: string[] = [];
    for (let i = 1; i <= 7; i++) cats.push(await mkCategory(`Cat ${i}`));
    const child = await mkCategory("Filha da 1", cats[0]);
    const spend = (categoryId: string, amount: string) =>
      mkTx(family.owner, {
        amount,
        transactionDate: TODAY,
        accountId: acc,
        categoryId,
      });
    // 6 categorias (Cat 1 recebe 100,00 + 50,00 da filha = 150,00)
    for (let i = 0; i < 6; i++) await spend(cats[i]!, `${(6 - i) * 100},00`);
    await spend(child, "50,00");
    actAs(family.owner);
    const six = await getDashboard(filters());
    expect(six.expenseByCategory.slices).toHaveLength(6);
    expect(
      six.expenseByCategory.slices.some((s) => s.categoryId === null),
    ).toBe(false);
    const cat1 = six.expenseByCategory.slices.find(
      (s) => s.categoryId === cats[0],
    );
    expect(cat1?.amount).toBe(c(65000)); // 600 + 50 (filha somada à pai)
    expect(six.expenseByCategory.slices.some((s) => s.categoryId === child)).toBe(
      false,
    );

    // 7ª categoria: 5 maiores + Outras (Cat 6 = 100 + Cat 7 = 20)
    await spend(cats[6]!, "20,00");
    actAs(family.owner);
    const seven = await getDashboard(filters());
    const { slices, total, rows } = seven.expenseByCategory;
    expect(slices).toHaveLength(6);
    const other = slices[5];
    expect(other).toMatchObject({
      categoryId: null,
      name: "Outras categorias",
      amount: c(12000),
    });
    expect(sumCents(slices.map((s) => s.amount))).toBe(total);
    expect(rows).toHaveLength(7);
  });

  it("estorno maior que o gasto do período deixa a categoria negativa, só na tabela", async () => {
    const family = await createTestFamily("dash-neg");
    const acc = await mkAccount(family.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    const cat = await mkCategory("Viagem");
    const other = await defaultCategoryId(family.owner, "expense", "Moradia");
    const original = await mkTx(family.owner, {
      amount: "100,00",
      transactionDate: PREV_DAY,
      accountId: acc,
      categoryId: cat,
    });
    await mkTx(family.owner, {
      amount: "50,00",
      transactionDate: TODAY,
      accountId: acc,
      categoryId: other,
    });
    actAs(family.owner);
    const reversal = await reverseTransaction({
      transactionId: original,
      amount: "100,00",
      transactionDate: TODAY,
      idempotencyKey: randomUUID(),
    });
    expect(reversal.ok).toBe(true);
    const d = await getDashboard(filters());
    const { slices, negative, rows } = d.expenseByCategory;
    expect(d.expense.current).toBe(c(-5000)); // 50 - 100
    expect(slices.map((s) => s.name)).toEqual(["Moradia"]);
    expect(negative).toHaveLength(1);
    expect(negative[0]).toMatchObject({ name: "Viagem", amount: c(-10000) });
    expect(rows).toHaveLength(2);
  });
});

describe("dashboard: últimas transações", () => {
  it("limite 5, só efetivadas e não excluídas, mais recentes primeiro; limite fora de 1..20 é recusado", async () => {
    const family = await createTestFamily("dash-recent");
    const acc = await mkAccount(family.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    const cat = await defaultCategoryId(family.owner, "expense", "Moradia");
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      ids.push(
        await mkTx(family.owner, {
          description: `Item ${i}`,
          amount: "1,00",
          transactionDate: addDays(TODAY, -i),
          accountId: acc,
          categoryId: cat,
        }),
      );
    }
    actAs(family.owner);
    expect((await deleteTransaction({ transactionId: ids[0]! })).ok).toBe(true);

    const { data: member } = await family.owner.client
      .from("family_members")
      .select("family_id")
      .eq("user_id", family.owner.id)
      .single();
    const pending = await family.owner.client.from("transactions").insert({
      family_id: member!.family_id,
      type: "expense",
      account_id: acc,
      category_id: cat,
      description: "Pendente",
      amount: "9.99" as unknown as number,
      transaction_date: TODAY,
      status: "pending",
    });
    expect(pending.error).toBeNull();

    actAs(family.owner);
    const period = { from: addDays(TODAY, -30), to: TODAY };
    const recent = await listRecentTransactions(period, 5);
    expect(recent).toHaveLength(5);
    expect(recent.map((t) => t.description)).toEqual([
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
      "Item 5",
    ]);
    expect(recent.every((t) => t.status === "paid")).toBe(true);
    await expect(listRecentTransactions(period, 0)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(listRecentTransactions(period, 21)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(await listRecentTransactions(period, 20)).toHaveLength(6);

    const d = await getDashboard(filters());
    expect(d.recentTransactions.length).toBeLessThanOrEqual(5);
  });
});

describe("dashboard: estado vazio e isolamento entre famílias", () => {
  it("família sem lançamentos: saldo inicial real, zeros e state no_transactions", async () => {
    const family = await createTestFamily("dash-vazio");
    await mkAccount(family.owner, "Corrente", { openingBalance: "250,00" });
    const d = await getDashboard(filters());
    expect(d.state).toBe("no_transactions");
    expect(d.consolidated.current).toBe(c(25000));
    expect(d.income.current).toBe(c(0));
    expect(d.expense.current).toBe(c(0));
    expect(d.expenseByCategory.slices).toEqual([]);
    expect(d.recentTransactions).toEqual([]);
    expect(d.cashFlow.months).toHaveLength(6);
    expect(d.cashFlow.months.every((m) => m.income === c(0))).toBe(true);
  });

  it("família sem conta ativa: no_accounts, sem movimento", async () => {
    const family = await createTestFamily("dash-semconta");
    const d = await getDashboard(filters());
    expect(d.state).toBe("no_accounts");
    expect(d.consolidated.current).toBe(c(0));
    expect(d.cashFlow.months).toEqual([]);
    expect(family.owner.id).toBeTruthy();
  });

  it("outra família nunca vê os dados alheios; sem família -> /onboarding", async () => {
    const a = await createTestFamily("dash-iso-a");
    const b = await createTestFamily("dash-iso-b");
    const accA = await mkAccount(a.owner, "Corrente A", {
      openingBalance: "5.555,55",
    });
    const cat = await defaultCategoryId(a.owner, "expense", "Moradia");
    await mkTx(a.owner, {
      description: "Segredo de A",
      amount: "777,77",
      transactionDate: TODAY,
      accountId: accA,
      categoryId: cat,
    });
    await mkAccount(b.owner, "Corrente B");

    actAs(b.owner);
    const d = await getDashboard(
      filters({
        periodo: "personalizado",
        de: addDays(TODAY, -300),
        ate: TODAY,
      }),
    );
    const json = JSON.stringify(d);
    expect(d.state).toBe("no_transactions");
    expect(d.consolidated.current).toBe(c(0));
    expect(d.expense.current).toBe(c(0));
    expect(d.recentTransactions).toEqual([]);
    expect(json).not.toContain("Segredo de A");
    expect(json).not.toContain("77777");
    expect(json).not.toContain("555555");

    const lone = await createLoneUser("dash-sem-familia");
    actAs(lone);
    expect(await redirectOf(getDashboard(filters()))).toBe("/onboarding");
  });
});
