import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Membership } from "@/modules/family/types";
import { DESCRIPTION_MAX } from "@/modules/transactions/constants";
import {
  insertTransaction,
  rpcCancelInstallmentRemaining,
  rpcCreateInstallmentPurchase,
  selectAccountType,
  selectDeletableInstallmentIds,
  selectFirstInstallmentId,
  selectGroupByIdempotencyKey,
  selectIdByIdempotencyKey,
  selectTransactionHead,
  softDeleteInstallmentGroup,
  softDeleteTransaction,
  updateTransactionRow,
  type TransactionWrite,
} from "@/modules/transactions/repository";
import type {
  reverseTransactionSchema,
  transactionInputSchema,
  updateTransactionSchema,
} from "@/modules/transactions/schemas";
import { AppError, isConstraintViolation } from "@/server/errors";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const IDEMPOTENCY_KEY = "transactions_family_idempotency_key";

type TransactionInput = z.output<typeof transactionInputSchema>;
type UpdateInput = z.output<typeof updateTransactionSchema>;

/** Campos que dependem do tipo: transferência não tem categoria; as demais não têm destino. */
function toWrite(data: TransactionInput | UpdateInput): TransactionWrite {
  const isTransfer = data.type === "transfer";
  return {
    accountId: data.accountId,
    destinationAccountId: isTransfer ? data.destinationAccountId : null,
    categoryId: isTransfer ? null : data.categoryId,
    assignedMemberId: data.assignedMemberId ?? null,
    description: data.description,
    amount: data.amount,
    transactionDate: data.transactionDate,
    notes: data.notes ?? null,
  };
}

/**
 * Insere respeitando a idempotência: repetir a chave devolve o `id` já existente (`23505` na
 * constraint de chave), sem erro.
 */
async function insertIdempotent(
  supabase: Client,
  membership: Membership,
  input: Parameters<typeof insertTransaction>[1],
): Promise<string> {
  try {
    return await insertTransaction(supabase, input);
  } catch (e) {
    if (isConstraintViolation(e, "23505", IDEMPOTENCY_KEY)) {
      const existing = await selectIdByIdempotencyKey(
        supabase,
        membership.familyId,
        input.idempotencyKey,
      );
      if (existing) return existing;
    }
    throw e;
  }
}

export type CreatedTransaction = {
  /** Lançamento criado; em compra parcelada, a 1ª parcela. */
  id: string;
  /** Grupo da compra parcelada (D23); `null` em lançamento comum. */
  installmentGroupId: string | null;
};

/** D23: compra parcelada via RPC (atômica, idempotente pela chave na 1ª parcela). */
async function createInstallmentPurchase(
  supabase: Client,
  membership: Membership,
  data: Extract<TransactionInput, { type: "expense" }>,
): Promise<CreatedTransaction> {
  // Não confia no cliente: só cartão de crédito parcela (a RPC confere de novo).
  const accountType = await selectAccountType(supabase, data.accountId);
  if (accountType !== "credit_card") {
    throw new AppError("INSTALLMENT_REQUIRES_CREDIT_CARD");
  }
  let groupId: string;
  try {
    groupId = await rpcCreateInstallmentPurchase(supabase, {
      accountId: data.accountId,
      categoryId: data.categoryId,
      assignedMemberId: data.assignedMemberId ?? null,
      description: data.description,
      totalAmount: data.amount,
      installments: data.installments,
      purchaseDate: data.transactionDate,
      notes: data.notes ?? null,
      idempotencyKey: data.idempotencyKey,
    });
  } catch (e) {
    // Corrida na chave: outra chamada gravou o grupo primeiro; devolve o dela.
    if (!isConstraintViolation(e, "23505", IDEMPOTENCY_KEY)) throw e;
    const existing = await selectGroupByIdempotencyKey(
      supabase,
      membership.familyId,
      data.idempotencyKey,
    );
    if (!existing) throw e;
    groupId = existing;
  }
  const id = await selectFirstInstallmentId(supabase, groupId);
  if (!id) throw new AppError("NOT_FOUND");
  return { id, installmentGroupId: groupId };
}

export async function createTransaction(
  supabase: Client,
  membership: Membership,
  data: TransactionInput,
): Promise<CreatedTransaction> {
  if (data.type === "expense" && data.installments > 1) {
    return createInstallmentPurchase(supabase, membership, data);
  }
  const id = await insertIdempotent(supabase, membership, {
    ...toWrite(data),
    familyId: membership.familyId,
    type: data.type,
    reversalOfId: null,
    idempotencyKey: data.idempotencyKey,
  });
  return { id, installmentGroupId: null };
}

/** "Cancelar parcelas futuras": a RPC confere a permissão (owner, admin ou autor). Devolve quantas cancelou. */
export async function cancelInstallmentRemaining(
  supabase: Client,
  groupId: string,
): Promise<number> {
  return rpcCancelInstallmentRemaining(supabase, groupId);
}

/** "Excluir compra": exclusão lógica de todas as parcelas não canceladas, numa só instrução. */
export async function deleteInstallmentPurchase(
  supabase: Client,
  groupId: string,
): Promise<number> {
  const ids = await selectDeletableInstallmentIds(supabase, groupId);
  if (ids.length === 0) throw new AppError("NOT_FOUND");
  const deleted = await softDeleteInstallmentGroup(supabase, groupId);
  // As parcelas são visíveis, mas o update não alcançou nenhuma: a RLS negou.
  if (deleted === 0) throw new AppError("FORBIDDEN");
  return deleted;
}

export async function updateTransaction(
  supabase: Client,
  data: UpdateInput,
): Promise<void> {
  const head = await selectTransactionHead(supabase, data.transactionId);
  if (!head || head.status !== "paid") throw new AppError("NOT_FOUND");
  // O tipo é imutável: o formulário só o usa para discriminar.
  if (head.type !== data.type) {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: { type: ["O tipo do lançamento não pode ser alterado."] },
    });
  }
  const updated = await updateTransactionRow(
    supabase,
    data.transactionId,
    toWrite(data),
  );
  // O lançamento é visível, mas o update não alcançou nenhuma linha: a RLS negou (não é autor/owner/admin).
  if (updated === 0) throw new AppError("FORBIDDEN");
}

export async function deleteTransaction(
  supabase: Client,
  transactionId: string,
): Promise<void> {
  const head = await selectTransactionHead(supabase, transactionId);
  if (!head || head.status !== "paid") throw new AppError("NOT_FOUND");
  const deleted = await softDeleteTransaction(supabase, transactionId);
  if (deleted === 0) throw new AppError("FORBIDDEN");
}

export async function reverseTransaction(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof reverseTransactionSchema>,
): Promise<string> {
  const original = await selectTransactionHead(supabase, data.transactionId);
  if (!original) throw new AppError("NOT_FOUND");
  // Transferência e estorno não têm estorno; o trigger confere o resto (status, data, saldo estornável).
  if (original.type === "transfer" || original.reversalOfId !== null) {
    throw new AppError("INVALID_REVERSAL");
  }
  return insertIdempotent(supabase, membership, {
    accountId: original.accountId,
    destinationAccountId: null,
    categoryId: original.categoryId,
    assignedMemberId: null,
    description: (data.description ?? `Estorno: ${original.description}`).slice(
      0,
      DESCRIPTION_MAX,
    ),
    amount: data.amount,
    transactionDate: data.transactionDate,
    notes: null,
    familyId: membership.familyId,
    type: original.type,
    reversalOfId: data.transactionId,
    idempotencyKey: data.idempotencyKey,
  });
}
