import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const repo = vi.hoisted(() => ({
  insertTransaction: vi.fn(),
  rpcCancelInstallmentRemaining: vi.fn(),
  rpcCreateInstallmentPurchase: vi.fn(),
  selectAccountType: vi.fn(),
  selectDeletableInstallmentIds: vi.fn(),
  selectFirstInstallmentId: vi.fn(),
  selectGroupByIdempotencyKey: vi.fn(),
  selectIdByIdempotencyKey: vi.fn(),
  selectTransactionHead: vi.fn(),
  softDeleteInstallmentGroup: vi.fn(),
  softDeleteTransaction: vi.fn(),
  updateTransactionRow: vi.fn(),
}));
vi.mock("@/modules/transactions/repository", () => repo);

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { asCents } from "@/lib/money";
import type { Membership } from "@/modules/family/types";
import {
  cancelInstallmentRemaining,
  createTransaction,
  deleteInstallmentPurchase,
} from "@/modules/transactions/service";
import type { transactionInputSchema } from "@/modules/transactions/schemas";
import { AppError } from "@/server/errors";
import type { Database } from "@/types/database";

const supabase = {} as SupabaseClient<Database>;
const membership = { familyId: "fam-1" } as Membership;
const ACCOUNT = "123e4567-e89b-42d3-a456-426614174001";
const CATEGORY = "123e4567-e89b-42d3-a456-426614174003";
const KEY = "123e4567-e89b-42d3-a456-426614174099";
const GROUP = "123e4567-e89b-42d3-a456-426614174055";

type Input = z.output<typeof transactionInputSchema>;
const expense = (over: Record<string, unknown> = {}): Input =>
  ({
    type: "expense",
    description: "Notebook",
    amount: asCents(10000),
    transactionDate: "2027-01-15",
    accountId: ACCOUNT,
    categoryId: CATEGORY,
    installments: 3,
    idempotencyKey: KEY,
    ...over,
  }) as Input;

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
});

describe("createTransaction: compra parcelada (D23)", () => {
  it("em cartão chama a RPC com o total e devolve a 1ª parcela e o grupo", async () => {
    repo.selectAccountType.mockResolvedValue("credit_card");
    repo.rpcCreateInstallmentPurchase.mockResolvedValue(GROUP);
    repo.selectFirstInstallmentId.mockResolvedValue("first-id");

    const out = await createTransaction(supabase, membership, expense());

    expect(out).toEqual({ id: "first-id", installmentGroupId: GROUP });
    expect(repo.rpcCreateInstallmentPurchase).toHaveBeenCalledWith(supabase, {
      accountId: ACCOUNT,
      categoryId: CATEGORY,
      assignedMemberId: null,
      description: "Notebook",
      totalAmount: 10000,
      installments: 3,
      purchaseDate: "2027-01-15",
      notes: null,
      idempotencyKey: KEY,
    });
    expect(repo.insertTransaction).not.toHaveBeenCalled();
  });

  it("fora de cartão responde INSTALLMENT_REQUIRES_CREDIT_CARD sem chamar a RPC", async () => {
    repo.selectAccountType.mockResolvedValue("checking");
    await expect(
      createTransaction(supabase, membership, expense()),
    ).rejects.toMatchObject({ code: "INSTALLMENT_REQUIRES_CREDIT_CARD" });
    expect(repo.rpcCreateInstallmentPurchase).not.toHaveBeenCalled();
  });

  it("conta invisível (outra família) também é recusada", async () => {
    repo.selectAccountType.mockResolvedValue(null);
    await expect(
      createTransaction(supabase, membership, expense()),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("corrida na chave (23505): devolve o grupo que já existe", async () => {
    repo.selectAccountType.mockResolvedValue("credit_card");
    repo.rpcCreateInstallmentPurchase.mockRejectedValue({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "transactions_family_idempotency_key"',
      details: "",
    });
    repo.selectGroupByIdempotencyKey.mockResolvedValue(GROUP);
    repo.selectFirstInstallmentId.mockResolvedValue("first-id");

    const out = await createTransaction(supabase, membership, expense());

    expect(out).toEqual({ id: "first-id", installmentGroupId: GROUP });
    expect(repo.selectGroupByIdempotencyKey).toHaveBeenCalledWith(
      supabase,
      "fam-1",
      KEY,
    );
  });

  it("erro da RPC que não é a corrida da chave é propagado", async () => {
    repo.selectAccountType.mockResolvedValue("credit_card");
    const failure = {
      code: "P0001",
      message: "FUTURE_DATE_NOT_ALLOWED",
      details: "",
    };
    repo.rpcCreateInstallmentPurchase.mockRejectedValue(failure);
    await expect(
      createTransaction(supabase, membership, expense()),
    ).rejects.toBe(failure);
  });

  it("1 parcela mantém o caminho atual (insert direto, sem RPC nem consulta de conta)", async () => {
    repo.insertTransaction.mockResolvedValue("tx-1");
    const out = await createTransaction(
      supabase,
      membership,
      expense({ installments: 1 }),
    );
    expect(out).toEqual({ id: "tx-1", installmentGroupId: null });
    expect(repo.rpcCreateInstallmentPurchase).not.toHaveBeenCalled();
    expect(repo.selectAccountType).not.toHaveBeenCalled();
  });
});

describe("cancelamento e exclusão da compra parcelada", () => {
  it("cancelInstallmentRemaining devolve o que a RPC cancelou", async () => {
    repo.rpcCancelInstallmentRemaining.mockResolvedValue(2);
    await expect(cancelInstallmentRemaining(supabase, GROUP)).resolves.toBe(2);
    expect(repo.rpcCancelInstallmentRemaining).toHaveBeenCalledWith(
      supabase,
      GROUP,
    );
  });

  it("deleteInstallmentPurchase exclui o grupo e devolve quantas linhas", async () => {
    repo.selectDeletableInstallmentIds.mockResolvedValue(["a", "b", "c"]);
    repo.softDeleteInstallmentGroup.mockResolvedValue(3);
    await expect(deleteInstallmentPurchase(supabase, GROUP)).resolves.toBe(3);
  });

  it("sem parcelas excluíveis visíveis -> NOT_FOUND; update sem alcance -> FORBIDDEN", async () => {
    repo.selectDeletableInstallmentIds.mockResolvedValue([]);
    await expect(
      deleteInstallmentPurchase(supabase, GROUP),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repo.selectDeletableInstallmentIds.mockResolvedValue(["a"]);
    repo.softDeleteInstallmentGroup.mockResolvedValue(0);
    await expect(
      deleteInstallmentPurchase(supabase, GROUP),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
