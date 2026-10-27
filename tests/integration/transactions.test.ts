import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, adminClient } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today, type ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { archiveAccount } from "@/modules/accounts/actions";
import { createCategory } from "@/modules/categories/actions";
import { getFamilyOverview } from "@/modules/family/queries";
import {
  createTransaction,
  deleteTransaction,
  reverseTransaction,
  updateTransaction,
} from "@/modules/transactions/actions";
import {
  getTransaction,
  listTransactions,
} from "@/modules/transactions/queries";
import { transactionFiltersSchema } from "@/modules/transactions/schemas";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

const admin = adminClient();
const filters = (raw: Record<string, string> = {}) =>
  transactionFiltersSchema.parse(raw);
const yesterday = (): ISODate => addDays(today(), -1);

describe("transações: criação, regras, permissões e estorno", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let checking: string;
  let savings: string;
  let expenseCat: string;
  let incomeCat: string;

  beforeAll(async () => {
    fam = await createTestFamily("tx");
    other = await createTestFamily("tx-outra");
    checking = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    savings = await mkAccount(fam.owner, "Poupança", { type: "savings" });
    expenseCat = await defaultCategoryId(fam.owner, "expense", "Alimentação");
    incomeCat = await defaultCategoryId(fam.owner, "income", "Salário");
  });

  const newExpense = (over: Record<string, unknown> = {}) => ({
    type: "expense" as const,
    description: "Mercado",
    amount: "50,00",
    transactionDate: yesterday(),
    accountId: checking,
    categoryId: expenseCat,
    idempotencyKey: randomUUID(),
    ...over,
  });

  it("member cria; repetir a idempotencyKey devolve o mesmo id, sem duplicar", async () => {
    actAs(fam.member);
    const input = newExpense({ description: "Padaria" });
    const first = await createTransaction(input);
    const second = await createTransaction(input);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.data.id).toBe(first.data.id);
    const { count } = await admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", input.idempotencyKey);
    expect(count).toBe(1);
  });

  it("transferência cria sem categoria; origem = destino -> VALIDATION_ERROR em destinationAccountId", async () => {
    actAs(fam.owner);
    const ok = await createTransaction({
      type: "transfer",
      description: "Reserva",
      amount: "10,00",
      transactionDate: yesterday(),
      accountId: checking,
      destinationAccountId: savings,
      idempotencyKey: randomUUID(),
    });
    expect(ok).toMatchObject({ ok: true });
    const same = await createTransaction({
      type: "transfer",
      description: "Reserva",
      amount: "10,00",
      transactionDate: yesterday(),
      accountId: checking,
      destinationAccountId: checking,
      idempotencyKey: randomUUID(),
    });
    expect(same).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { destinationAccountId: expect.any(Array) },
      },
    });
  });

  it("regras do banco viram códigos com fieldErrors", async () => {
    actAs(fam.owner);
    const cases: [Record<string, unknown>, string, string][] = [
      [{ amount: "0" }, "VALIDATION_ERROR", "amount"],
      [{ categoryId: incomeCat }, "CATEGORY_TYPE_MISMATCH", "categoryId"],
      [
        { transactionDate: "2025-12-31" },
        "DATE_BEFORE_OPENING_BALANCE",
        "transactionDate",
      ],
      [
        { transactionDate: addDays(today(), 1) },
        "VALIDATION_ERROR",
        "transactionDate",
      ],
    ];
    for (const [over, code, field] of cases) {
      const result = await createTransaction(newExpense(over));
      expect(result).toMatchObject({
        ok: false,
        error: { code, fieldErrors: { [field]: expect.any(Array) } },
      });
    }
  });

  it("conta arquivada -> ACCOUNT_ARCHIVED; categoria arquivada -> CATEGORY_ARCHIVED", async () => {
    const dead = await mkAccount(fam.owner, "Fechada");
    actAs(fam.owner);
    await archiveAccount({ accountId: dead });
    expect(
      await createTransaction(newExpense({ accountId: dead })),
    ).toMatchObject({ ok: false, error: { code: "ACCOUNT_ARCHIVED" } });

    const cat = await createCategory({
      name: "Descontinuada",
      type: "expense",
      color: "chart-2",
      icon: "gift",
    });
    if (!cat.ok) throw new Error("createCategory falhou");
    const { archiveCategory } = await import("@/modules/categories/actions");
    await archiveCategory({ categoryId: cat.data.id });
    expect(
      await createTransaction(newExpense({ categoryId: cat.data.id })),
    ).toMatchObject({ ok: false, error: { code: "CATEGORY_ARCHIVED" } });
  });

  it("autor × owner/admin na edição; outra família -> NOT_FOUND; tipo diferente -> VALIDATION_ERROR", async () => {
    const mine = await mkTx(fam.member, {
      amount: "20,00",
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
    });
    const edit = (id: string, amount: string, over = {}) => ({
      type: "expense" as const,
      transactionId: id,
      description: "Editado",
      amount,
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
      ...over,
    });

    actAs(fam.member);
    expect(await updateTransaction(edit(mine, "25,00"))).toMatchObject({
      ok: true,
    });
    actAs(fam.admin);
    expect(await updateTransaction(edit(mine, "26,00"))).toMatchObject({
      ok: true,
    });

    const owners = await mkTx(fam.owner, {
      amount: "30,00",
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
    });
    actAs(fam.member);
    expect(await updateTransaction(edit(owners, "31,00"))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await deleteTransaction({ transactionId: owners })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    actAs(other.owner);
    expect(await updateTransaction(edit(owners, "31,00"))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await getTransaction(owners)).toBeNull();

    actAs(fam.owner);
    expect(
      await updateTransaction({
        type: "income",
        transactionId: owners,
        description: "x",
        amount: "1,00",
        transactionDate: yesterday(),
        accountId: checking,
        categoryId: incomeCat,
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("exclusão lógica: some da lista e do detalhe; repetir -> NOT_FOUND", async () => {
    const id = await mkTx(fam.owner, {
      amount: "7,00",
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
      description: "Para excluir",
    });
    actAs(fam.owner);
    expect(await deleteTransaction({ transactionId: id })).toMatchObject({
      ok: true,
    });
    expect(await getTransaction(id)).toBeNull();
    expect((await listTransactions(filters({ q: "Para excluir" }))).total).toBe(
      0,
    );
    expect(await deleteTransaction({ transactionId: id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const { data } = await admin
      .from("transactions")
      .select("deleted_at, deleted_by")
      .eq("id", id)
      .single();
    expect(data?.deleted_at).not.toBeNull();
  });

  it("estorno: parcial, excedente, idempotência, bloqueios e permissões", async () => {
    const original = await mkTx(fam.member, {
      amount: "100,00",
      transactionDate: addDays(today(), -3),
      accountId: checking,
      categoryId: expenseCat,
      description: "Compra devolvida",
    });
    const reversal = (over: Record<string, unknown> = {}) => ({
      transactionId: original,
      amount: "40,00",
      transactionDate: yesterday(),
      idempotencyKey: randomUUID(),
      ...over,
    });

    // admin pode estornar lançamento alheio; a descrição padrão sai do original
    actAs(fam.admin);
    const input = reversal();
    const first = await reverseTransaction(input);
    const replay = await reverseTransaction(input);
    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(replay.data.id).toBe(first.data.id);

    const detail = await getTransaction(original);
    expect(detail).toMatchObject({
      reversibleAmount: asCents(6000),
      canDelete: false,
      canReverse: true,
    });
    expect(detail?.reversals).toHaveLength(1);

    const reversalItem = await getTransaction(first.data.id);
    expect(reversalItem).toMatchObject({
      description: "Estorno: Compra devolvida",
      direction: "in",
      reversalOfId: original,
      category: { id: expenseCat },
      account: { id: checking },
    });

    expect(
      await reverseTransaction(reversal({ amount: "60,01" })),
    ).toMatchObject({
      ok: false,
      error: {
        code: "REVERSAL_EXCEEDS_REMAINING",
        fieldErrors: { amount: expect.any(Array) },
      },
    });
    expect(
      await reverseTransaction(
        reversal({ transactionDate: addDays(today(), -4) }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REVERSAL" } });

    // original com estorno ativo: editar valor e excluir bloqueados
    actAs(fam.member);
    expect(
      await updateTransaction({
        type: "expense",
        transactionId: original,
        description: "Compra devolvida",
        amount: "90,00",
        transactionDate: addDays(today(), -3),
        accountId: checking,
        categoryId: expenseCat,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TRANSACTION_HAS_REVERSALS" },
    });
    expect(await deleteTransaction({ transactionId: original })).toMatchObject({
      ok: false,
      error: { code: "TRANSACTION_HAS_REVERSALS" },
    });

    // member que não é autor não estorna
    const owners = await mkTx(fam.owner, {
      amount: "10,00",
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
    });
    actAs(fam.member);
    expect(
      await reverseTransaction(
        reversal({ transactionId: owners, amount: "5,00" }),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    // estorno de estorno e de transferência
    actAs(fam.owner);
    expect(
      await reverseTransaction(reversal({ transactionId: first.data.id })),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REVERSAL" } });
    const transfer = await createTransaction({
      type: "transfer",
      description: "Mover",
      amount: "5,00",
      transactionDate: yesterday(),
      accountId: checking,
      destinationAccountId: savings,
      idempotencyKey: randomUUID(),
    });
    if (!transfer.ok) throw new Error("transferência falhou");
    expect(
      await reverseTransaction(reversal({ transactionId: transfer.data.id })),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REVERSAL" } });

    // excluir o estorno libera o original
    expect(
      await deleteTransaction({ transactionId: first.data.id }),
    ).toMatchObject({
      ok: true,
    });
    expect((await getTransaction(original))?.canDelete).toBe(true);
  });

  it("histórico: owner/admin leem a auditoria (sem descrição); member recebe null", async () => {
    const id = await mkTx(fam.member, {
      amount: "200,00",
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
      description: "Segredo familiar",
    });
    actAs(fam.member);
    await updateTransaction({
      type: "expense",
      transactionId: id,
      description: "Segredo familiar",
      amount: "250,00",
      transactionDate: yesterday(),
      accountId: checking,
      categoryId: expenseCat,
    });
    expect((await getTransaction(id))?.history).toBeNull();

    actAs(fam.admin);
    const detail = await getTransaction(id);
    expect(detail?.canEdit).toBe(true);
    expect(detail?.history).toHaveLength(1);
    expect(detail?.history?.[0]).toMatchObject({
      action: "transaction.updated",
      actorName: fam.member.displayName,
      changes: [{ field: "amount", old: "200.00", new: "250.00" }],
    });
    expect(JSON.stringify(detail?.history)).not.toContain("Segredo");
  });
});

describe("transações: listagem, filtros, busca e paginação", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let a: string;
  let b: string;
  let food: string;
  let foodChild: string;
  let salary: string;
  let memberId: string;

  beforeAll(async () => {
    fam = await createTestFamily("lst");
    other = await createTestFamily("lst-outra");
    a = await mkAccount(fam.owner, "Conta A");
    b = await mkAccount(fam.owner, "Conta B");
    food = await defaultCategoryId(fam.owner, "expense", "Alimentação");
    salary = await defaultCategoryId(fam.owner, "income", "Salário");
    actAs(fam.owner);
    const child = await createCategory({
      name: "Restaurante",
      type: "expense",
      color: "chart-3",
      icon: "utensils",
      parentId: food,
    });
    if (!child.ok) throw new Error("subcategoria falhou");
    foodChild = child.data.id;
    memberId =
      (await getFamilyOverview()).members.find(
        (m) => m.userId === fam.member.id,
      )?.memberId ?? "";

    // 45 despesas em dias consecutivos (a mais recente é ontem); desempate por created_at.
    for (let i = 0; i < 45; i++) {
      await mkTx(fam.owner, {
        description: `Item ${String(i + 1).padStart(2, "0")}`,
        amount: "1,00",
        transactionDate: addDays(today(), -1 - i),
        accountId: a,
        categoryId: i === 0 ? foodChild : food,
        assignedMemberId: i === 1 ? memberId : undefined,
      });
    }
  });

  it("total e pageCount com 45 lançamentos e 20 por página; última página parcial", async () => {
    actAs(fam.member);
    const p1 = await listTransactions(filters());
    expect(p1).toMatchObject({
      total: 45,
      page: 1,
      pageSize: 20,
      pageCount: 3,
    });
    expect(p1.items).toHaveLength(20);
    expect(p1.items[0]?.description).toBe("Item 01");
    const p3 = await listTransactions(filters({ pagina: "3" }));
    expect(p3.items).toHaveLength(5);
    expect(p3.items.at(-1)?.description).toBe("Item 45");
    const all = await listTransactions(filters({ por_pagina: "100" }));
    expect(all.items).toHaveLength(45);
  });

  it("página além da última: itens vazios e total correto; filtros inválidos viram padrão", async () => {
    actAs(fam.member);
    const beyond = await listTransactions(filters({ pagina: "9" }));
    expect(beyond).toMatchObject({
      items: [],
      total: 45,
      page: 9,
      pageCount: 3,
    });
    expect(
      filters({ pagina: "x", ordem: "zzz", por_pagina: "7", de: "2026-02-30" }),
    ).toMatchObject({
      pagina: 1,
      ordem: "data_desc",
      por_pagina: 20,
    });
  });

  it("ordem: data asc inverte; valor desc desempata de forma estável", async () => {
    actAs(fam.owner);
    const asc = await listTransactions(filters({ ordem: "data_asc" }));
    expect(asc.items[0]?.description).toBe("Item 45");
    await mkTx(fam.owner, {
      description: "Grande",
      amount: "999,99",
      transactionDate: addDays(today(), -50),
      accountId: a,
      categoryId: food,
    });
    const byValue = await listTransactions(filters({ ordem: "valor_desc" }));
    expect(byValue.items[0]).toMatchObject({
      description: "Grande",
      amount: asCents(99999),
    });
    const again = await listTransactions(filters({ ordem: "valor_desc" }));
    expect(again.items.map((i) => i.id)).toEqual(
      byValue.items.map((i) => i.id),
    );
  });

  it("filtros: período, tipo, categoria com filhas, responsável e nenhum", async () => {
    actAs(fam.owner);
    const period = await listTransactions(
      filters({ de: addDays(today(), -3), ate: addDays(today(), -2) }),
    );
    expect(period.total).toBe(2);

    expect((await listTransactions(filters({ tipo: "receita" }))).total).toBe(
      0,
    );
    expect((await listTransactions(filters({ tipo: "despesa" }))).total).toBe(
      46,
    );

    // categoria pai inclui a filha; a filha sozinha tem 1
    expect((await listTransactions(filters({ categoria: food }))).total).toBe(
      46,
    );
    expect(
      (await listTransactions(filters({ categoria: foodChild }))).total,
    ).toBe(1);

    expect(
      (await listTransactions(filters({ responsavel: memberId }))).total,
    ).toBe(1);
    expect(
      (await listTransactions(filters({ responsavel: "nenhum" }))).total,
    ).toBe(45);
  });

  it("conta filtra origem ou destino, com direção da transferência; estornos aparecem", async () => {
    actAs(fam.owner);
    const transfer = await createTransaction({
      type: "transfer",
      description: "A para B",
      amount: "3,00",
      transactionDate: yesterday(),
      accountId: a,
      destinationAccountId: b,
      idempotencyKey: randomUUID(),
    });
    if (!transfer.ok) throw new Error("transferência falhou");
    const income = await mkTx(fam.owner, {
      type: "income",
      description: "Pagamento",
      amount: "100,00",
      transactionDate: yesterday(),
      accountId: b,
      categoryId: salary,
    });

    const onB = await listTransactions(filters({ conta: b }));
    expect(onB.items.map((i) => i.description).sort()).toEqual(
      ["A para B", "Pagamento"].sort(),
    );
    expect(onB.items.find((i) => i.description === "A para B")).toMatchObject({
      direction: "in",
      destinationAccount: { id: b },
    });
    const onA = await listTransactions(filters({ conta: a, q: "A para B" }));
    expect(onA.items[0]?.direction).toBe("out");
    const noFilter = await listTransactions(filters({ q: "A para B" }));
    expect(noFilter.items[0]?.direction).toBe("neutral");

    const rev = await reverseTransaction({
      transactionId: income,
      amount: "10,00",
      transactionDate: yesterday(),
      idempotencyKey: randomUUID(),
    });
    if (!rev.ok) throw new Error("estorno falhou");
    const found = await listTransactions(filters({ q: "Estorno", conta: b }));
    expect(found.items).toHaveLength(1);
    expect(found.items[0]).toMatchObject({
      id: rev.data.id,
      direction: "out",
      reversalOfId: income,
    });
  });

  it("busca: ilike com %, _ e \\ literais", async () => {
    actAs(fam.owner);
    const tx = (description: string) =>
      mkTx(fam.owner, {
        description,
        amount: "2,00",
        transactionDate: yesterday(),
        accountId: a,
        categoryId: food,
      });
    await tx("Desconto 50% off");
    await tx("Desconto 50 por cento");
    await tx("snake_case");
    await tx("snakeXcase");
    await tx("C:\\pasta");

    const names = async (q: string) =>
      (await listTransactions(filters({ q }))).items.map((i) => i.description);
    expect(await names("50%")).toEqual(["Desconto 50% off"]);
    expect(await names("e_c")).toEqual(["snake_case"]);
    expect(await names("\\pasta")).toEqual(["C:\\pasta"]);
    expect(await names("DESCONTO")).toHaveLength(2);
    expect(await names("%")).toEqual(["Desconto 50% off"]);
  });

  it("isolamento: outra família não lista nem lê", async () => {
    actAs(other.owner);
    const page = await listTransactions(filters({ por_pagina: "100" }));
    expect(page.total).toBe(0);
    const { data } = await admin
      .from("transactions")
      .select("id")
      .eq("account_id", a)
      .limit(1);
    expect(await getTransaction(data?.[0]?.id ?? randomUUID())).toBeNull();
  });
});
