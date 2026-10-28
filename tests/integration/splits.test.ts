import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today } from "@/lib/dates";
import { createBill, payBill } from "@/modules/bills/actions";
import { getFamilyOverview } from "@/modules/family/queries";
import {
  createSettlement,
  deleteSettlement,
  setTransactionSplits,
} from "@/modules/splits/actions";
import {
  getMemberBalances,
  getTransactionSplit,
  listSettlements,
  listSharedExpenses,
} from "@/modules/splits/queries";
import { getTransaction } from "@/modules/transactions/queries";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

const cents = (list: { amount: number }[]) => list.map((p) => p.amount);

describe("divisão de contas e acertos", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let account: string;
  let expenseCat: string;
  let incomeCat: string;
  let ids: { owner: string; admin: string; member: string };
  let ordered: string[];

  beforeAll(async () => {
    fam = await createTestFamily("split");
    other = await createTestFamily("split-outra");
    account = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    expenseCat = await defaultCategoryId(fam.owner, "expense", "Alimentação");
    incomeCat = await defaultCategoryId(fam.owner, "income", "Salário");
    actAs(fam.owner);
    const members = (await getFamilyOverview()).members;
    const idOf = (userId: string) =>
      members.find((m) => m.userId === userId)?.memberId ?? "";
    ids = {
      owner: idOf(fam.owner.id),
      admin: idOf(fam.admin.id),
      member: idOf(fam.member.id),
    };
    // Ordem de entrada na família: joined_at, id (a mesma da divisão igual).
    ordered = members.map((m) => m.memberId);
  });

  const expense = (amount: string, over = {}) =>
    mkTx(fam.owner, {
      amount,
      transactionDate: today(),
      accountId: account,
      categoryId: expenseCat,
      ...over,
    });

  it("divisão igual: D13 pelo banco, prévia do detalhe e lista com a minha parte", async () => {
    const id = await expense("100,00", { description: "Mercado dividido" });
    actAs(fam.owner);
    const res = await setTransactionSplits({
      mode: "equal",
      transactionId: id,
      memberIds: ordered,
    });
    expect(res).toMatchObject({ ok: true });

    const detail = await getTransactionSplit(id);
    expect(detail?.mode).toBe("equal");
    expect(detail?.splittable).toBe(true);
    expect(detail?.canEdit).toBe(true);
    expect(cents(detail?.parts ?? [])).toEqual([3334, 3333, 3333]);
    expect(detail?.parts.map((p) => p.member.id)).toEqual(ordered);

    const list = await listSharedExpenses({});
    const item = list.items.find((i) => i.id === id);
    expect(item).toMatchObject({ amount: 10000, status: "paid" });
    expect(item?.parts).toHaveLength(3);
    expect(item?.myShare).toBe(
      item?.parts.find((p) => p.member.id === ids.owner)?.amount,
    );
    // A divisão não muda o lançamento nem o saldo (contrato §0.2).
    expect((await getTransaction(id))?.amount).toBe(10000);
  });

  it("por valores: soma exata ou SPLIT_SUM_MISMATCH; modo derivado = amounts", async () => {
    const id = await expense("90,00");
    actAs(fam.admin);
    const bad = await setTransactionSplits({
      mode: "amounts",
      transactionId: id,
      shares: [
        { memberId: ids.owner, amount: "40,00" },
        { memberId: ids.admin, amount: "40,00" },
      ],
    });
    // O admin gerencia qualquer lançamento da família; a soma não fecha.
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "SPLIT_SUM_MISMATCH" },
    });
    const ok = await setTransactionSplits({
      mode: "amounts",
      transactionId: id,
      shares: [
        { memberId: ids.owner, amount: "50,00" },
        { memberId: ids.admin, amount: "40,00" },
      ],
    });
    expect(ok).toMatchObject({ ok: true });
    actAs(fam.owner);
    const detail = await getTransactionSplit(id);
    expect(detail?.mode).toBe("amounts");
    expect(cents(detail?.parts ?? [])).toEqual([5000, 4000]);
  });

  it("remover a divisão tira a despesa da lista", async () => {
    const id = await expense("30,00");
    actAs(fam.owner);
    await setTransactionSplits({
      mode: "equal",
      transactionId: id,
      memberIds: [ids.owner, ids.admin],
    });
    expect((await listSharedExpenses({})).items.some((i) => i.id === id)).toBe(
      true,
    );
    expect(
      await setTransactionSplits({ mode: "none", transactionId: id }),
    ).toMatchObject({ ok: true });
    expect((await listSharedExpenses({})).items.some((i) => i.id === id)).toBe(
      false,
    );
    expect((await getTransactionSplit(id))?.mode).toBeNull();
  });

  it("valor menor que o nº de partes em centavos: erro de validação claro, não INTERNAL_ERROR", async () => {
    const id = await expense("0,02");
    actAs(fam.owner);
    const res = await setTransactionSplits({
      mode: "equal",
      transactionId: id,
      memberIds: ordered,
    });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "SPLIT_AMOUNT_TOO_SMALL" },
    });
    if (!res.ok) {
      expect(res.error.code).not.toBe("INTERNAL_ERROR");
      expect(res.error.message).toBeTruthy();
      expect(res.error.fieldErrors?.amount?.[0]).toBeTruthy();
    }
    expect((await getTransactionSplit(id))?.parts).toHaveLength(0);
  });

  it("pagar compromisso dividido reescala; valor pequeno demais vira erro de validação", async () => {
    const make = async () => {
      const r = await createBill({
        repeat: false,
        kind: "pagar",
        description: "Conta dividida",
        amount: "10,00",
        dueDate: addDays(today(), 3),
        accountId: account,
        categoryId: expenseCat,
        idempotencyKey: randomUUID(),
      });
      if (!r.ok) throw new Error(`createBill falhou: ${r.error.code}`);
      actAs(fam.owner);
      await setTransactionSplits({
        mode: "equal",
        transactionId: r.data.id,
        memberIds: ordered,
      });
      return r.data.id;
    };
    actAs(fam.owner);
    const tiny = await make();
    const tinyRes = await payBill({
      transactionId: tiny,
      paidOn: today(),
      amount: "0,02",
      accountId: account,
    });
    expect(tinyRes).toMatchObject({
      ok: false,
      error: { code: "SPLIT_AMOUNT_TOO_SMALL" },
    });
    if (!tinyRes.ok) {
      expect(tinyRes.error.code).not.toBe("INTERNAL_ERROR");
      expect(tinyRes.error.message).toBeTruthy();
      expect(tinyRes.error.fieldErrors?.amount?.[0]).toBeTruthy();
    }

    const id = await make();
    expect(
      await payBill({
        transactionId: id,
        paidOn: today(),
        amount: "20,00",
        accountId: account,
      }),
    ).toMatchObject({ ok: true });
    const detail = await getTransactionSplit(id);
    expect(cents(detail?.parts ?? []).reduce((a, b) => a + b, 0)).toBe(2000);
    expect(cents(detail?.parts ?? [])).toEqual([668, 666, 666]);
  });

  it("autorização e isolamento", async () => {
    const own = await expense("50,00");
    const income = await mkTx(fam.owner, {
      type: "income",
      amount: "50,00",
      transactionDate: today(),
      accountId: account,
      categoryId: incomeCat,
    });
    const input = (transactionId: string) => ({
      mode: "equal" as const,
      transactionId,
      memberIds: [ids.owner, ids.member],
    });

    actAs(fam.member);
    expect(await setTransactionSplits(input(own))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect((await getTransactionSplit(own))?.canEdit).toBe(false);

    actAs(fam.owner);
    expect(await setTransactionSplits(input(income))).toMatchObject({
      ok: false,
      error: { code: "SPLIT_NOT_ALLOWED" },
    });
    expect(await getTransactionSplit(income)).toBeNull();

    actAs(other.owner);
    expect(await getTransactionSplit(own)).toBeNull();
    expect(await setTransactionSplits(input(own))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });

    actAs(fam.owner);
    expect(
      await setTransactionSplits({
        mode: "equal",
        transactionId: own,
        memberIds: [ids.owner],
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("acertos: criar (idempotente), autorização, excluir e saldos", async () => {
    const date = today();
    const body = (from: string, to: string, key = randomUUID()) => ({
      fromMemberId: from,
      toMemberId: to,
      amount: "20,00",
      settlementDate: date,
      idempotencyKey: key,
    });

    actAs(fam.member);
    const key = randomUUID();
    const first = await createSettlement(body(ids.member, ids.owner, key));
    expect(first).toMatchObject({ ok: true });
    const again = await createSettlement(body(ids.member, ids.owner, key));
    expect(again).toEqual(first);

    // Member que não é uma das partes não registra acerto entre outros dois.
    expect(await createSettlement(body(ids.owner, ids.admin))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(
      await createSettlement({
        ...body(ids.member, ids.owner),
        settlementDate: addDays(date, 1),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await createSettlement(body(ids.member, ids.member))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });

    const list = await listSettlements({});
    const mine = list.items.find(
      (i) => i.id === (first.ok ? first.data.id : ""),
    );
    expect(mine).toMatchObject({ amount: 2000, canDelete: true });
    expect(mine?.recordedBy).toBeTruthy();
    expect(mine?.from.id).toBe(ids.member);

    // Outro integrante (nem autor, nem owner/admin) vê, mas não exclui.
    const settlementId = first.ok ? first.data.id : "";
    actAs(fam.admin);
    expect(
      (await listSettlements({})).items.find((i) => i.id === settlementId)
        ?.canDelete,
    ).toBe(true); // admin gerencia
    actAs(other.owner);
    expect(await deleteSettlement({ settlementId })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });

    const balances = await (async () => {
      actAs(fam.owner);
      return getMemberBalances();
    })();
    expect(balances.myMemberId).toBe(ids.owner);
    // O acerto de 20,00 do member ao owner aparece como crédito do member contra o owner (D10).
    expect(
      balances.pairs.find(
        (p) => p.debtor.id === ids.owner && p.creditor.id === ids.member,
      ),
    ).toBeDefined();

    actAs(fam.member);
    expect(await deleteSettlement({ settlementId })).toMatchObject({
      ok: true,
    });
    expect(await deleteSettlement({ settlementId })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
