import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { asCents } from "@/lib/money";
import { addMonths, endOfMonth, startOfMonth, today } from "@/lib/dates";
import { createBill } from "@/modules/bills/actions";
import { getFamilyOverview } from "@/modules/family/queries";
import { getPlanningBaseline } from "@/modules/planning/queries";
import { projectBalance } from "@/modules/planning/domain/projection";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

describe("planejamento: base conhecida (D15)", () => {
  let fam: TestFamily;
  let account: string;
  let expenseCat: string;
  let incomeCat: string;

  beforeAll(async () => {
    fam = await createTestFamily("plan");
    account = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    expenseCat = await defaultCategoryId(fam.owner, "expense", "Alimentação");
    incomeCat = await defaultCategoryId(fam.owner, "income", "Salário");
  });

  it("família sem contas: hasAccounts falso, projeção de 12 meses", async () => {
    const empty = await createTestFamily("plan-vazia");
    actAs(empty.owner);
    const base = await getPlanningBaseline();
    expect(base.hasAccounts).toBe(false);
    expect(base.consolidatedBalance).toBe(0);
    expect(base.goals).toEqual([]);
    expect(base.projection).toHaveLength(12);
  });

  it("médias dos 3 meses completos, saldo de hoje, projeção e ritmo da meta", async () => {
    const now = today();
    const prev = (n: number) => startOfMonth(addMonths(now, -n));
    // 3 meses anteriores: receita 600 e despesa 300 no total (média 200,00 e 100,00).
    await mkTx(fam.owner, {
      type: "income",
      amount: "600,00",
      transactionDate: prev(2),
      accountId: account,
      categoryId: incomeCat,
    });
    await mkTx(fam.owner, {
      amount: "100,00",
      transactionDate: prev(1),
      accountId: account,
      categoryId: expenseCat,
    });
    await mkTx(fam.owner, {
      amount: "200,01",
      transactionDate: endOfMonth(prev(3)),
      accountId: account,
      categoryId: expenseCat,
    });

    // Compromisso no próximo mês aparece como previsto.
    actAs(fam.owner);
    const nextMonth = startOfMonth(addMonths(now, 1));
    const bill = await createBill({
      repeat: false,
      kind: "pagar",
      description: "Parcela",
      amount: "70,00",
      dueDate: nextMonth,
      accountId: account,
      categoryId: expenseCat,
      idempotencyKey: randomUUID(),
    });
    expect(bill).toMatchObject({ ok: true });

    // Meta ativa com um aporte de hoje: o ritmo é o líquido da janela ÷ 3 (D9).
    const members = (await getFamilyOverview()).members;
    const meId = members.find((m) => m.userId === fam.owner.id)?.memberId;
    const goal = await fam.owner.client
      .from("goals")
      .insert({
        family_id: (await fam.owner.client.from("families").select("id").single())
          .data!.id,
        name: "Viagem",
        target_amount: "1000.00" as unknown as number,
        idempotency_key: randomUUID(),
      })
      .select("id")
      .single();
    expect(goal.error).toBeNull();
    const contribution = await fam.owner.client
      .from("goal_contributions")
      .insert({
        family_id: (await fam.owner.client.from("families").select("id").single())
          .data!.id,
        goal_id: goal.data!.id,
        member_id: meId!,
        kind: "deposit",
        amount: "300.00" as unknown as number,
        contribution_date: now,
        idempotency_key: randomUUID(),
      });
    expect(contribution.error).toBeNull();

    const base = await getPlanningBaseline();
    expect(base.today).toBe(now);
    expect(base.hasAccounts).toBe(true);
    expect(base.averageWindow).toEqual({
      from: prev(3),
      to: endOfMonth(prev(1)),
    });
    // (600,00 − 100,00 − 200,01) ÷ 3 = 99,997 → 100,00; despesa (300,01 ÷ 3 = 100,003) → 100,00.
    expect(base.averageMonthly).toEqual({
      income: 20000,
      expense: 10000,
      result: 10000,
    });
    expect(base.categoryAverages[0]).toMatchObject({
      name: "Alimentação",
      average: 10000,
    });
    // Saldo de hoje: abertura 1.000,00 + 600,00 − 300,01 (lançamentos já efetivados).
    expect(base.consolidatedBalance).toBe(100000 + 60000 - 30001);
    expect(base.goals).toEqual([
      expect.objectContaining({
        id: goal.data!.id,
        saved: 30000,
        target: 100000,
        pace: 10000,
        targetDate: null,
      }),
    ]);

    expect(base.projection).toHaveLength(12);
    expect(base.projection[0]?.month).toBe(startOfMonth(now));
    const next = base.projection.find((p) => p.month === nextMonth);
    expect(next).toMatchObject({ pendingExpense: 7000 });
    expect(next?.label).toMatch(/\d{4}$/);

    // O domínio consome a base sem NaN e o saldo do mês seguinte fecha com a conta.
    const projected = projectBalance({
      months: 2,
      monthlyAdjustment: asCents(0),
      baseline: base,
    });
    expect(projected.ok).toBe(true);
  });
});
