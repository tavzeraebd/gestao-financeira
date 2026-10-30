import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Membership } from "@/modules/family/types";
import { selectIdByIdempotencyKey } from "@/modules/transactions/repository";
import { AppError, isConstraintViolation, toAppError } from "@/server/errors";
import type { Database } from "@/types/database";
import { BILL_KIND_TO_TYPE } from "./constants";
import {
  insertPendingTransaction,
  insertRecurrence,
  rpcCancelPendingTransaction,
  rpcMaterializeRecurrences,
  rpcPayPendingTransaction,
  selectBillStatus,
  selectRecurrenceIdByIdempotencyKey,
  updatePendingRow,
} from "./repository";
import type {
  billFormSchema,
  payBillSchema,
  updateBillSchema,
} from "./schemas";

type Client = SupabaseClient<Database>;

const TRANSACTION_KEY = "transactions_family_idempotency_key";
const RECURRENCE_KEY = "recurrences_family_idempotency_key";

/**
 * Erros de data do banco nascem mapeados para `transactionDate`; no formulário de compromisso o
 * campo é `dueDate` (criar/editar) ou `paidOn` (pagar).
 */
async function withDateField<T>(
  field: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const app = toAppError(e);
    if (
      app.code === "DATE_BEFORE_OPENING_BALANCE" ||
      app.code === "FUTURE_DATE_NOT_ALLOWED"
    ) {
      throw new AppError(app.code, {
        cause: e,
        fieldErrors: { [field]: [app.message] },
      });
    }
    throw e;
  }
}

type BillInput = z.output<typeof billFormSchema>;

/**
 * Sem repetição: compromisso `pending` (idempotente pela chave). Com repetição: série + materialização
 * (a série nasce mesmo que a materialização falhe: a próxima leitura a refaz, e ela é idempotente).
 */
export function createBill(
  supabase: Client,
  membership: Membership,
  data: BillInput,
): Promise<{ id: string; kind: "transaction" | "recurrence" }> {
  return withDateField("dueDate", () =>
    createBillUnmapped(supabase, membership, data),
  );
}

async function createBillUnmapped(
  supabase: Client,
  membership: Membership,
  data: BillInput,
): Promise<{ id: string; kind: "transaction" | "recurrence" }> {
  const type = BILL_KIND_TO_TYPE[data.kind];
  const common = {
    familyId: membership.familyId,
    type,
    accountId: data.accountId,
    categoryId: data.categoryId,
    assignedMemberId: data.assignedMemberId ?? null,
    description: data.description,
    amount: data.amount,
    idempotencyKey: data.idempotencyKey,
  };

  if (!data.repeat) {
    try {
      const id = await insertPendingTransaction(supabase, {
        ...common,
        dueDate: data.dueDate,
        notes: data.notes ?? null,
      });
      return { id, kind: "transaction" };
    } catch (e) {
      if (isConstraintViolation(e, "23505", TRANSACTION_KEY)) {
        const existing = await selectIdByIdempotencyKey(
          supabase,
          membership.familyId,
          data.idempotencyKey,
        );
        if (existing) return { id: existing, kind: "transaction" };
      }
      throw e;
    }
  }

  let id: string;
  try {
    id = await insertRecurrence(supabase, {
      ...common,
      frequency: data.frequency,
      intervalCount: data.intervalCount,
      startDate: data.dueDate,
      endDate: data.endDate ?? null,
      payrollDeduction: data.payrollDeduction,
    });
  } catch (e) {
    const existing = isConstraintViolation(e, "23505", RECURRENCE_KEY)
      ? await selectRecurrenceIdByIdempotencyKey(
          supabase,
          membership.familyId,
          data.idempotencyKey,
        )
      : null;
    if (!existing) throw e;
    id = existing;
  }
  try {
    await rpcMaterializeRecurrences(supabase);
  } catch {
    // Falha silenciosa: a materialização é idempotente e roda de novo na próxima leitura.
  }
  return { id, kind: "recurrence" };
}

export async function updateBill(
  supabase: Client,
  data: z.output<typeof updateBillSchema>,
): Promise<void> {
  const status = await selectBillStatus(supabase, data.transactionId);
  if (status === null) throw new AppError("NOT_FOUND");
  if (status !== "pending") throw new AppError("INVALID_STATUS_TRANSITION");
  const updated = await withDateField("dueDate", () =>
    updatePendingRow(supabase, data.transactionId, {
      accountId: data.accountId,
      categoryId: data.categoryId,
      assignedMemberId: data.assignedMemberId ?? null,
      description: data.description,
      amount: data.amount,
      dueDate: data.dueDate,
      notes: data.notes ?? null,
    }),
  );
  // Visível e pendente, mas o update não alcançou a linha: a RLS negou (não é autor/owner/admin).
  if (updated === 0) throw new AppError("FORBIDDEN");
}

export async function payBill(
  supabase: Client,
  data: z.output<typeof payBillSchema>,
): Promise<void> {
  try {
    await withDateField("paidOn", () =>
      rpcPayPendingTransaction(supabase, data),
    );
  } catch (e) {
    // Despesa dividida paga com valor menor que o nº de partes em centavos: a reescala geraria parcela 0,00.
    if (isConstraintViolation(e, "23514", "expense_splits")) {
      throw new AppError("VALIDATION_ERROR", {
        cause: e,
        fieldErrors: {
          amount: [
            "Esta despesa está dividida entre vários integrantes e o valor é pequeno demais para repartir. Informe um valor maior ou remova a divisão.",
          ],
        },
      });
    }
    throw e;
  }
}

export async function cancelBill(
  supabase: Client,
  transactionId: string,
): Promise<void> {
  await rpcCancelPendingTransaction(supabase, transactionId);
}
