import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { actAs, adminClient } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today, type ISODate } from "@/lib/dates";
import { asAggregateCents, asCents, fromDbNumeric } from "@/lib/money";
import { getAccountsOverview } from "@/modules/accounts/queries";
import {
  createTransaction,
  deleteTransaction,
  reverseTransaction,
  updateTransaction,
} from "@/modules/transactions/actions";
import {
  getPendingCommitted,
  getPeriodSummary,
  getTransaction,
} from "@/modules/transactions/queries";
import { createTestFamily } from "./helpers/family";
import {
  defaultCategoryId,
  mkAccount,
  mkTx,
  OPENING_DATE,
} from "./helpers/fixtures";

const admin = adminClient();
const c = asCents;
const FROM = OPENING_DATE as ISODate;

/** Cenário R1 numa família nova: corrente 1.000,00, poupança 0; receita 500, despesa 200, transferência 100. */
async function scenarioR1(label: string) {
  const fam = await createTestFamily(label);
  const checking = await mkAccount(fam.owner, "Corrente", {
    openingBalance: "1.000,00",
  });
  const savings = await mkAccount(fam.owner, "Poupança", { type: "savings" });
  const expenseCat = await defaultCategoryId(fam.owner, "expense", "Moradia");
  const incomeCat = await defaultCategoryId(fam.owner, "income", "Salário");
  const date = addDays(today(), -1);
  await mkTx(fam.owner, {
    type: "income",
    amount: "500,00",
    transactionDate: date,
    accountId: checking,
    categoryId: incomeCat,
  });
  const expense = await mkTx(fam.owner, {
    amount: "200,00",
    transactionDate: date,
    accountId: checking,
    categoryId: expenseCat,
  });
  actAs(fam.owner);
  const transfer = await createTransaction({
    type: "transfer",
    description: "Reserva",
    amount: "100,00",
    transactionDate: date,
    accountId: checking,
    destinationAccountId: savings,
    idempotencyKey: randomUUID(),
  });
  if (!transfer.ok) throw new Error("transferência falhou");
  return { fam, checking, savings, expenseCat, expense, date };
}

async function balances() {
  const overview = await getAccountsOverview();
  const byName = new Map(overview.accounts.map((a) => [a.name, a.balance]));
  return { overview, byName };
}

describe("regressão financeira (D1, D3, D4, D5, D6, D8) pela camada de serviço", () => {
  it("R1 (CA-E3-35): consolidado, saldos por conta e resumo do período", async () => {
    const { fam } = await scenarioR1("r1");
    actAs(fam.member);
    const { overview, byName } = await balances();
    expect(overview.consolidatedBalance).toBe(c(130000));
    expect(byName.get("Corrente")).toBe(c(120000));
    expect(byName.get("Poupança")).toBe(c(10000));
    expect(overview.openCardDebt).toBe(c(0));
    expect(await getPeriodSummary(FROM, today())).toEqual({
      income: c(50000),
      expense: c(20000),
      result: c(30000),
    });
  });

  it("R2: estorno de 50,00 -> consolidado 1.350,00 e despesas 150,00", async () => {
    const { fam, expense } = await scenarioR1("r2");
    actAs(fam.owner);
    const rev = await reverseTransaction({
      transactionId: expense,
      amount: "50,00",
      transactionDate: today(),
      idempotencyKey: randomUUID(),
    });
    expect(rev).toMatchObject({ ok: true });
    expect((await balances()).overview.consolidatedBalance).toBe(c(135000));
    expect(await getPeriodSummary(FROM, today())).toMatchObject({
      expense: c(15000),
      income: c(50000),
      result: c(35000),
    });
  });

  it("R3: despesa pendente 80,00 não altera o consolidado; comprometido 80,00", async () => {
    const { fam, checking, expenseCat } = await scenarioR1("r3");
    actAs(fam.owner);
    // A Etapa 3 só cria `paid`; o pendente entra por escrita direta com a RLS do usuário.
    const { data: member } = await fam.owner.client
      .from("family_members")
      .select("family_id")
      .eq("user_id", fam.owner.id)
      .single();
    const { error } = await fam.owner.client.from("transactions").insert({
      family_id: member?.family_id ?? "",
      type: "expense",
      account_id: checking,
      category_id: expenseCat,
      description: "Conta de luz",
      amount: "80.00" as unknown as number,
      transaction_date: addDays(today(), 5),
      status: "pending",
    });
    expect(error).toBeNull();
    expect((await balances()).overview.consolidatedBalance).toBe(c(130000));
    expect(await getPendingCommitted()).toBe(c(8000));
    expect(await getPeriodSummary(FROM, addDays(today(), 10))).toMatchObject({
      expense: c(20000),
    });
  });

  it("R4: compra no cartão em março e pagamento em abril", async () => {
    const fam = await createTestFamily("r4");
    const checking = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    const card = await mkAccount(fam.owner, "Cartão", {
      type: "credit_card",
      statementClosingDay: 10,
      statementDueDay: 20,
    });
    const cat = await defaultCategoryId(fam.owner, "expense", "Compras");
    await mkTx(fam.owner, {
      amount: "300,00",
      transactionDate: "2026-03-15",
      accountId: card,
      categoryId: cat,
    });
    actAs(fam.owner);
    const pay = await createTransaction({
      type: "transfer",
      description: "Fatura",
      amount: "300,00",
      transactionDate: "2026-04-10",
      accountId: checking,
      destinationAccountId: card,
      idempotencyKey: randomUUID(),
    });
    expect(pay).toMatchObject({ ok: true });

    expect(
      await getPeriodSummary("2026-03-01" as ISODate, "2026-03-31" as ISODate),
    ).toMatchObject({ expense: c(30000) });
    expect(
      await getPeriodSummary("2026-04-01" as ISODate, "2026-04-30" as ISODate),
    ).toMatchObject({ expense: c(0) });

    const asOf = async (date: string) => {
      const { data } = await fam.owner.client.rpc("account_balances", {
        p_as_of: date,
      });
      const row = (data ?? []).find((r) => r.account_id === checking);
      return row ? fromDbNumeric(row.balance) : null;
    };
    // consolidado (corrente) só cai em abril; a dívida do cartão zera depois do pagamento
    expect(await asOf("2026-03-31")).toBe(c(100000));
    expect(await asOf("2026-04-30")).toBe(c(70000));
    const { overview } = await balances();
    expect(overview.openCardDebt).toBe(c(0));
    expect(overview.consolidatedBalance).toBe(c(70000));
  });

  it("R7: edição 200,00 -> 250,00 atualiza o resumo e audita old/new", async () => {
    const { fam, expense, checking, expenseCat, date } = await scenarioR1("r7");
    actAs(fam.owner);
    const result = await updateTransaction({
      type: "expense",
      transactionId: expense,
      description: "Lançamento de teste",
      amount: "250,00",
      transactionDate: date,
      accountId: checking,
      categoryId: expenseCat,
    });
    expect(result).toMatchObject({ ok: true });
    expect(await getPeriodSummary(FROM, today())).toMatchObject({
      expense: c(25000),
    });
    const { data } = await admin
      .from("audit_events")
      .select("action, metadata")
      .eq("entity_id", expense)
      .eq("action", "transaction.updated");
    expect(data).toHaveLength(1);
    expect(data?.[0]?.metadata).toMatchObject({
      changed: ["amount"],
      old: { amount: "200.00" },
      new: { amount: "250.00" },
    });
    expect((await getTransaction(expense))?.history?.[0]?.changes).toEqual([
      { field: "amount", old: "200.00", new: "250.00" },
    ]);
  });

  it("R8: exclusão lógica zera as despesas e preserva a linha", async () => {
    const { fam, expense } = await scenarioR1("r8");
    actAs(fam.owner);
    expect(await deleteTransaction({ transactionId: expense })).toMatchObject({
      ok: true,
    });
    expect(await getPeriodSummary(FROM, today())).toMatchObject({
      expense: c(0),
      income: c(50000),
    });
    expect((await balances()).overview.consolidatedBalance).toBe(c(150000));
    const { data } = await admin
      .from("transactions")
      .select("id, deleted_at")
      .eq("id", expense)
      .single();
    expect(data?.deleted_at).not.toBeNull();
  });

  it("SEC-18: lançamentos no teto por valor somam sem lançar em /contas e period_summary; acima do teto é rejeitado", async () => {
    const fam = await createTestFamily("sec18");
    const top = "99.999.999,99";
    const a = await mkAccount(fam.owner, "Teto A", { openingBalance: top });
    const b = await mkAccount(fam.owner, "Teto B", { openingBalance: top });
    const cat = await defaultCategoryId(fam.owner, "income", "Salário");
    const date = addDays(today(), -1);
    for (const accountId of [a, b]) {
      await mkTx(fam.owner, {
        type: "income",
        amount: top,
        transactionDate: date,
        accountId,
        categoryId: cat,
      });
    }
    actAs(fam.owner);
    const { overview } = await balances();
    // 2 contas × (saldo inicial + receita) = 4 × 99.999.999,99
    expect(overview.consolidatedBalance).toBe(asAggregateCents(39_999_999_996));
    expect((await getPeriodSummary(FROM, today())).income).toBe(
      asAggregateCents(19_999_999_998),
    );

    const over = await createTransaction({
      type: "income",
      description: "Acima do teto",
      amount: "100.000.000,00",
      transactionDate: date,
      accountId: a,
      categoryId: cat,
      idempotencyKey: randomUUID(),
    });
    expect(over).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { amount: expect.any(Array) },
      },
    });
  });
});
