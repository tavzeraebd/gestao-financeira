import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, adminClient, type TestUser } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, addMonths, startOfMonth, today } from "@/lib/dates";
import { asCents } from "@/lib/money";
import {
  archiveBudget,
  createBudget,
  unarchiveBudget,
  updateBudget,
} from "@/modules/budgets/actions";
import { getBudget, getBudgetsOverview } from "@/modules/budgets/queries";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

const admin = adminClient();
const thisMonth = startOfMonth(today());
const ym = (d: string) => d.slice(0, 7);

async function familyIdOf(user: TestUser): Promise<string> {
  const { data, error } = await admin
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();
  if (error) throw error;
  return data.family_id;
}

describe("orçamentos: regras, permissões e visão do mês", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let account: string;
  let food: string;
  let transport: string;
  let salary: string;

  beforeAll(async () => {
    fam = await createTestFamily("bg");
    other = await createTestFamily("bg-outra");
    account = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "5.000,00",
    });
    food = await defaultCategoryId(fam.owner, "expense", "Alimentação");
    transport = await defaultCategoryId(fam.owner, "expense", "Transporte");
    salary = await defaultCategoryId(fam.owner, "income", "Salário");
  });

  const input = (over: Record<string, unknown> = {}) => ({
    categoryId: food,
    amountLimit: "500,00",
    startMonth: ym(addMonths(thisMonth, -2)),
    ...over,
  });

  it("member não cria; owner cria; duplicado ativo e tipo errado são recusados", async () => {
    actAs(fam.member);
    expect(await createBudget(input())).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    actAs(fam.admin);
    const created = await createBudget(input());
    expect(created).toMatchObject({ ok: true });

    actAs(fam.owner);
    const dup = await createBudget(input({ amountLimit: "10,00" }));
    expect(dup).toMatchObject({
      ok: false,
      error: { code: "BUDGET_ALREADY_EXISTS" },
    });
    if (!dup.ok) expect(dup.error.fieldErrors?.categoryId?.length).toBe(1);

    expect(await createBudget(input({ categoryId: null }))).toMatchObject({
      ok: true,
    });
    expect(await createBudget(input({ categoryId: null }))).toMatchObject({
      ok: false,
      error: { code: "BUDGET_ALREADY_EXISTS" },
    });
    expect(await createBudget(input({ categoryId: salary }))).toMatchObject({
      ok: false,
      error: { code: "CATEGORY_TYPE_MISMATCH" },
    });
    expect(await createBudget(input({ amountLimit: "0,00" }))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("visão do mês: realizado, previsto, disponível, percentual, estado e histórico", async () => {
    // Realizado: R$ 400,00 hoje e R$ 120,00 no mês anterior, na categoria do orçamento.
    await mkTx(fam.owner, {
      amount: "400,00",
      transactionDate: today(),
      accountId: account,
      categoryId: food,
    });
    await mkTx(fam.owner, {
      amount: "120,00",
      transactionDate: addDays(addMonths(thisMonth, -1), 4),
      accountId: account,
      categoryId: food,
    });
    // Previsto: série mensal de R$ 80,00 (a ocorrência de hoje fica pendente).
    const { error } = await fam.owner.client.from("recurrences").insert({
      family_id: await familyIdOf(fam.owner),
      type: "expense",
      account_id: account,
      category_id: food,
      description: "Padaria",
      amount: 80,
      frequency: "monthly",
      start_date: today(),
      idempotency_key: randomUUID(),
    } as never);
    if (error) throw error;

    actAs(fam.member);
    const overview = await getBudgetsOverview({
      month: thisMonth,
      archived: false,
    });
    expect(overview.month).toBe(thisMonth);
    expect(overview.budgets).toHaveLength(2);

    const foodBudget = overview.budgets.find((b) => b.category?.id === food);
    expect(foodBudget).toMatchObject({
      amountLimit: asCents(50000),
      spent: asCents(40000),
      committed: asCents(8000),
      available: asCents(10000),
      percent: 80,
      status: "attention",
      canManage: false,
      category: { name: "Alimentação", archived: false },
    });
    // Meses anteriores dentro da vigência (início há 2 meses): o mais recente primeiro.
    expect(foodBudget?.history).toHaveLength(2);
    expect(foodBudget?.history[0]).toMatchObject({
      month: addMonths(thisMonth, -1),
      spent: asCents(12000),
      status: "ok",
    });
    expect(foodBudget?.history[1]).toMatchObject({
      month: addMonths(thisMonth, -2),
      spent: asCents(0),
    });

    // "Todas as despesas" soma todas as categorias de despesa.
    const all = overview.budgets.find((b) => b.category === null);
    expect(all).toMatchObject({ spent: asCents(40000), canManage: false });

    // Mês antes da vigência: sem orçamentos.
    const before = await getBudgetsOverview({
      month: addMonths(thisMonth, -3),
      archived: false,
    });
    expect(before.budgets).toEqual([]);

    actAs(fam.owner);
    expect(
      (await getBudgetsOverview({ month: thisMonth, archived: false }))
        .budgets[0]?.canManage,
    ).toBe(true);
  });

  it("editar, encerrar a vigência, arquivar e reativar", async () => {
    actAs(fam.owner);
    const created = await createBudget({
      categoryId: transport,
      amountLimit: "200,00",
      startMonth: ym(thisMonth),
    });
    if (!created.ok) throw new Error("createBudget falhou");
    const id = created.data.id;

    expect(await getBudget(id)).toMatchObject({
      id,
      categoryId: transport,
      categoryName: "Transporte",
      amountLimit: asCents(20000),
      startMonth: thisMonth,
      endMonth: null,
    });

    expect(await updateBudget({ budgetId: id, amountLimit: "250,00" })).toEqual(
      { ok: true, data: null },
    );
    expect((await getBudget(id))?.amountLimit).toBe(asCents(25000));

    // término antes do início: erro no campo
    const bad = await updateBudget({
      budgetId: id,
      amountLimit: "250,00",
      endMonth: ym(addMonths(thisMonth, -1)),
    });
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    if (!bad.ok) expect(bad.error.fieldErrors?.endMonth?.length).toBe(1);

    // término no mês atual: o mês seguinte não mostra o orçamento
    expect(
      await updateBudget({
        budgetId: id,
        amountLimit: "250,00",
        endMonth: ym(thisMonth),
      }),
    ).toMatchObject({ ok: true });
    const next = await getBudgetsOverview({
      month: addMonths(thisMonth, 1),
      archived: false,
    });
    expect(next.budgets.some((b) => b.id === id)).toBe(false);

    // arquivar é idempotente e muda de aba
    expect(await archiveBudget({ budgetId: id })).toMatchObject({ ok: true });
    const archivedAt = (await getBudget(id))?.archivedAt;
    expect(archivedAt).not.toBeNull();
    expect(await archiveBudget({ budgetId: id })).toMatchObject({ ok: true });
    expect((await getBudget(id))?.archivedAt).toBe(archivedAt);
    const archived = await getBudgetsOverview({
      month: thisMonth,
      archived: true,
    });
    expect(archived.budgets.map((b) => b.id)).toContain(id);
    const active = await getBudgetsOverview({
      month: thisMonth,
      archived: false,
    });
    expect(active.budgets.map((b) => b.id)).not.toContain(id);

    // novo ativo na mesma categoria impede reativar o antigo
    const again = await createBudget({
      categoryId: transport,
      amountLimit: "100,00",
      startMonth: ym(thisMonth),
    });
    expect(again).toMatchObject({ ok: true });
    expect(await unarchiveBudget({ budgetId: id })).toMatchObject({
      ok: false,
      error: { code: "BUDGET_ALREADY_EXISTS" },
    });
    actAs(fam.member);
    expect(
      await updateBudget({ budgetId: id, amountLimit: "1,00" }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await archiveBudget({ budgetId: id })).toMatchObject({ ok: true });
  });

  it("categoria arquivada aparece sinalizada", async () => {
    actAs(fam.owner);
    const cat = await defaultCategoryId(fam.owner, "expense", "Lazer");
    const created = await createBudget({
      categoryId: cat,
      amountLimit: "90,00",
      startMonth: ym(thisMonth),
    });
    if (!created.ok) throw new Error("createBudget falhou");
    const { error } = await fam.owner.client
      .from("categories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", cat);
    if (error) throw error;

    const view = (
      await getBudgetsOverview({ month: thisMonth, archived: false })
    ).budgets.find((b) => b.id === created.data.id);
    expect(view?.category).toMatchObject({ id: cat, archived: true });
  });

  it("outra família não enxerga nem altera; ids inválidos", async () => {
    actAs(fam.owner);
    const own = await getBudgetsOverview({ month: thisMonth, archived: false });
    const id = own.budgets[0]!.id;

    actAs(other.owner);
    expect(
      (await getBudgetsOverview({ month: thisMonth, archived: false })).budgets,
    ).toEqual([]);
    expect(await getBudget(id)).toBeNull();
    expect(await getBudget("nao-e-uuid")).toBeNull();
    expect(await archiveBudget({ budgetId: id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(
      await updateBudget({ budgetId: id, amountLimit: "1,00" }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await archiveBudget({ budgetId: "xyz" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
