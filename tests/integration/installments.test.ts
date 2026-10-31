import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, adminClient } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addMonths, today } from "@/lib/dates";
import { getAccount } from "@/modules/accounts/queries";
import {
  cancelInstallmentRemaining,
  createTransaction,
  deleteInstallmentPurchase,
} from "@/modules/transactions/actions";
import { listInstallmentGroup } from "@/modules/transactions/queries";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount } from "./helpers/fixtures";

const admin = adminClient();

// Casos de ADR-0040 (R21/R22). Requerem o banco local com a migration 20261031100000 aplicada.
describe("compra parcelada no cartão (D23)", () => {
  let fam: TestFamily;
  let card: string;
  let checking: string;
  let cat: string;

  beforeAll(async () => {
    fam = await createTestFamily("parc");
    card = await mkAccount(fam.owner, "Cartão", {
      type: "credit_card",
      creditLimit: "5.000,00",
      statementClosingDay: 10,
      statementDueDay: 20,
    });
    checking = await mkAccount(fam.owner, "Corrente");
    cat = await defaultCategoryId(fam.owner, "expense", "Alimentação");
  });

  const purchase = (over: Record<string, unknown> = {}) => ({
    type: "expense" as const,
    description: "Notebook",
    amount: "100,00",
    transactionDate: today(),
    accountId: card,
    categoryId: cat,
    installments: 3,
    idempotencyKey: randomUUID(),
    ...over,
  });

  it("R21: 100,00 em 3x = 33,34 (paid) / 33,33 / 33,33 (pending); repetir a chave devolve o mesmo grupo", async () => {
    actAs(fam.owner);
    const input = purchase();
    const first = await createTransaction(input);
    const second = await createTransaction(input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data.installmentGroupId).not.toBeNull();
    expect(second.data.installmentGroupId).toBe(first.data.installmentGroupId);

    const group = await listInstallmentGroup(first.data.installmentGroupId!);
    expect(group.map((p) => p.amount)).toEqual([3334, 3333, 3333]);
    expect(group.map((p) => p.installmentNumber)).toEqual([1, 2, 3]);
    expect(group.map((p) => p.status)).toEqual(["paid", "pending", "pending"]);
    expect(group.map((p) => p.transactionDate)).toEqual([
      today(),
      addMonths(today(), 1),
      addMonths(today(), 2),
    ]);
    const { count } = await admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("installment_group_id", first.data.installmentGroupId!);
    expect(count).toBe(3);

    // P5: limite = 5.000,00 - 33,34 (dívida) - 66,66 (pendentes)
    const account = await getAccount(card);
    expect(account?.availableCredit).toBe(490000);
  });

  it("recusa conta que não é cartão, valor pequeno demais e data futura", async () => {
    actAs(fam.owner);
    expect(
      await createTransaction(purchase({ accountId: checking })),
    ).toMatchObject({
      ok: false,
      error: { code: "INSTALLMENT_REQUIRES_CREDIT_CARD" },
    });
    expect(
      await createTransaction(purchase({ amount: "0,05", installments: 6 })),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { amount: expect.any(Array) },
      },
    });
    expect(
      await createTransaction(purchase({ installments: 37 })),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("cancelar parcelas futuras e excluir a compra", async () => {
    actAs(fam.owner);
    const created = await createTransaction(purchase({ installments: 4 }));
    if (!created.ok) throw new Error("falhou");
    const groupId = created.data.installmentGroupId!;

    const canceled = await cancelInstallmentRemaining({ groupId });
    expect(canceled).toMatchObject({ ok: true, data: { canceled: 3 } });
    const again = await cancelInstallmentRemaining({ groupId });
    expect(again).toMatchObject({ ok: true, data: { canceled: 0 } });

    const deleted = await deleteInstallmentPurchase({ groupId });
    expect(deleted).toMatchObject({ ok: true, data: { deleted: 1 } });
    expect(await listInstallmentGroup(groupId)).toHaveLength(3);
    expect(await deleteInstallmentPurchase({ groupId })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
