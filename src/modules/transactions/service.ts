import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Membership } from "@/modules/family/types";
import { DESCRIPTION_MAX } from "@/modules/transactions/constants";
import {
  insertTransaction,
  selectIdByIdempotencyKey,
  selectTransactionHead,
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

export async function createTransaction(
  supabase: Client,
  membership: Membership,
  data: TransactionInput,
): Promise<string> {
  return insertIdempotent(supabase, membership, {
    ...toWrite(data),
    familyId: membership.familyId,
    type: data.type,
    reversalOfId: null,
    idempotencyKey: data.idempotencyKey,
  });
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
