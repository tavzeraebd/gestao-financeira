import "server-only";
import { today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/modules/family/permissions";
import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";
import { selectTransactionHistory } from "@/modules/transactions/repository";
import { requireMembership } from "@/server/auth";
import { UPCOMING_DAYS } from "./constants";
import {
  rpcPendingSummary,
  selectBillDetail,
  selectBillPage,
  selectUpcomingBills,
  toBillItem,
} from "./repository";
import { billFiltersSchema } from "./schemas";
import type {
  BillDetail,
  BillFilters,
  BillListItem,
  BillPage,
  BillsSummary,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listBills(filters: BillFilters): Promise<BillPage> {
  const membership = await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  // O schema é tolerante: passar de novo os filtros já normalizados é idempotente.
  const f = billFiltersSchema.parse(filters);
  const { items, total } = await selectBillPage(
    supabase,
    f,
    { role: membership.role, userId: membership.userId },
    today(),
  );
  return {
    items,
    total,
    page: f.pagina,
    pageSize: f.por_pagina,
    pageCount: Math.max(1, Math.ceil(total / f.por_pagina)),
  };
}

export async function getBill(id: string): Promise<BillDetail | null> {
  const membership = await requireMembership();
  // Id que não é uuid não existe (evita o erro 22P02 do Postgres).
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const row = await selectBillDetail(supabase, id);
  if (!row) return null;
  const item = toBillItem(
    row,
    { role: membership.role, userId: membership.userId },
    today(),
  );
  return {
    ...item,
    notes: row.notes,
    createdBy: {
      id: row.created_by,
      displayName: row.creator?.display_name ?? "Integrante",
    },
    createdAt: row.created_at,
    history: can(membership.role, "audit.read")
      ? await selectTransactionHistory(supabase, id)
      : null,
  };
}

export async function getBillsSummary(): Promise<BillsSummary> {
  await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  return rpcPendingSummary(supabase);
}

/** D19: pendentes com vencimento até hoje + 30 dias (vencidos incluídos), vencimento crescente. */
export async function listUpcomingBills(
  options: { limit?: number } = {},
): Promise<BillListItem[]> {
  const membership = await requireMembership();
  const limit = options.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError("Limite de próximos vencimentos inválido.");
  }
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  return selectUpcomingBills(
    supabase,
    UPCOMING_DAYS,
    limit,
    { role: membership.role, userId: membership.userId },
    today(),
  );
}
