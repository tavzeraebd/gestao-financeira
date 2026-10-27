import "server-only";
import type { ISODate } from "@/lib/dates";
import { subCents, sumCents, asCents, type Cents } from "@/lib/money";
import { dbDate } from "@/lib/supabase/db-values";
import { createClient } from "@/lib/supabase/server";
import { rpcPendingSummary, toFrequency } from "@/modules/bills/repository";
import { can } from "@/modules/family/permissions";
import { frequencyLabel } from "@/modules/recurrences/domain/labels";
import {
  rpcPeriodSummary,
  selectActiveReversals,
  selectCategoryFamilyIds,
  selectRecentTransactions,
  selectTransactionDetail,
  selectTransactionHistory,
  selectTransactionPage,
  toListItem,
} from "@/modules/transactions/repository";
import { transactionFiltersSchema } from "@/modules/transactions/schemas";
import type {
  PeriodSummary,
  TransactionListItem,
  TransactionDetail,
  TransactionFilters,
  TransactionPage,
} from "@/modules/transactions/types";
import { requireMembership } from "@/server/auth";
import { AppError } from "@/server/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listTransactions(
  filters: TransactionFilters,
): Promise<TransactionPage> {
  const membership = await requireMembership();
  const supabase = await createClient();
  // O schema é tolerante: passar de novo os filtros já normalizados é idempotente.
  const f = transactionFiltersSchema.parse(filters);
  const categoryIds = f.categoria
    ? await selectCategoryFamilyIds(supabase, f.categoria)
    : null;
  const { items, total } = await selectTransactionPage(
    supabase,
    f,
    categoryIds,
    {
      role: membership.role,
      userId: membership.userId,
      accountFilterId: f.conta,
    },
  );
  return {
    items,
    total,
    page: f.pagina,
    pageSize: f.por_pagina,
    pageCount: Math.max(1, Math.ceil(total / f.por_pagina)),
  };
}

export async function getTransaction(
  id: string,
): Promise<TransactionDetail | null> {
  const membership = await requireMembership();
  // Id que não é uuid não existe (evita o erro 22P02 do Postgres).
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const row = await selectTransactionDetail(supabase, id);
  if (!row) return null;

  const viewer = { role: membership.role, userId: membership.userId };
  const item = toListItem(row, viewer);
  const reversals = await selectActiveReversals(supabase, id);
  const eligible =
    item.type !== "transfer" &&
    item.status === "paid" &&
    item.reversalOfId === null;
  const reversed = sumCents(reversals.map((r) => r.amount));
  const reversibleAmount: Cents = eligible
    ? subCents(item.amount, reversed)
    : asCents(0);

  return {
    ...item,
    notes: row.notes,
    dueDate: row.due_date ? dbDate(row.due_date) : null,
    recurrence: row.recurrence
      ? {
          id: row.recurrence.id,
          label: frequencyLabel(
            toFrequency(row.recurrence.frequency),
            row.recurrence.interval_count,
            dbDate(row.recurrence.start_date),
          ),
        }
      : null,
    createdBy: {
      id: row.created_by,
      displayName: row.creator?.display_name ?? "Integrante",
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reversals: reversals.map((r) => ({
      id: r.id,
      amount: r.amount,
      transactionDate: dbDate(r.transactionDate),
    })),
    reversibleAmount,
    canEdit: item.canManage,
    canDelete: item.canManage && reversals.length === 0,
    canReverse: item.canManage && reversibleAmount > 0,
    history: can(membership.role, "audit.read")
      ? await selectTransactionHistory(supabase, id)
      : null,
  };
}

/** D4 via `period_summary` (transferências fora; estornos abatem pela data do estorno). */
export async function getPeriodSummary(
  from: ISODate,
  to: ISODate,
): Promise<PeriodSummary> {
  await requireMembership();
  const supabase = await createClient();
  try {
    return await rpcPeriodSummary(supabase, from, to);
  } catch (e) {
    // Agregado acima do inteiro seguro (SEC-18): erro explícito e tratado.
    if (e instanceof RangeError) {
      throw new AppError("INTERNAL_ERROR", { cause: e });
    }
    throw e;
  }
}

/** Últimas transações efetivadas do período (dashboard). `limit` entre 1 e 20. */
export async function listRecentTransactions(
  period: { from: ISODate; to: ISODate },
  limit: number,
): Promise<TransactionListItem[]> {
  const membership = await requireMembership();
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new AppError("VALIDATION_ERROR");
  }
  const supabase = await createClient();
  return selectRecentTransactions(supabase, period.from, period.to, limit, {
    role: membership.role,
    userId: membership.userId,
  });
}

/** D6 "comprometido" = só o a pagar `pending` (D14; R3/R12), via `pending_summary` (D19). */
export async function getPendingCommitted(): Promise<Cents> {
  await requireMembership();
  const supabase = await createClient();
  const summary = await rpcPendingSummary(supabase);
  return summary.payable;
}
