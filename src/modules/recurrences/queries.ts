import "server-only";
import { today, type ISODate } from "@/lib/dates";
import { dbDate } from "@/lib/supabase/db-values";
import { createClient } from "@/lib/supabase/server";
import {
  toCategoryColor,
  toCategoryIcon,
} from "@/modules/categories/constants";
import { canManageTransaction } from "@/modules/family/permissions";
import { ATTENTION_MESSAGES } from "@/modules/recurrences/constants";
import { frequencyLabel } from "@/modules/recurrences/domain/labels";
import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";
import {
  amountOf,
  selectNextPendingByRecurrence,
  selectRecurrenceById,
  selectRecurrencesPage,
  toFrequency,
  type RecurrenceRow,
} from "@/modules/recurrences/repository";
import { recurrenceFiltersSchema } from "@/modules/recurrences/schemas";
import type {
  RecurrenceFilters,
  RecurrenceState,
  RecurrenceView,
} from "@/modules/recurrences/types";
import { requireMembership } from "@/server/auth";
import { memberDisplayName } from "@/modules/family/domain/member-name";

/** Séries por página lida (o limite é 100 ativas por família; o laço cobre o resto). */
const PAGE_SIZE = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stateOf(row: RecurrenceRow, now: ISODate): RecurrenceState {
  if (row.end_date !== null && row.end_date < now) return "ended";
  if (!row.is_active) return "paused";
  return row.last_failure_code !== null ? "attention" : "active";
}

function toView(
  row: RecurrenceRow,
  nextPending: ReadonlyMap<string, string>,
  viewer: { role: Parameters<typeof canManageTransaction>[0]; userId: string },
  now: ISODate,
): RecurrenceView {
  if (!row.account || !row.category) {
    throw new Error("Recorrência sem conta ou categoria visível.");
  }
  const frequency = toFrequency(row.frequency);
  const startDate = dbDate(row.start_date);
  const endDate = row.end_date === null ? null : dbDate(row.end_date);
  const scheduled = nextPending.get(row.id);
  const fallback =
    row.is_active && (endDate === null || row.next_occurrence_date <= endDate)
      ? dbDate(row.next_occurrence_date)
      : null;
  const state = stateOf(row, now);
  const code = row.last_failure_code;
  return {
    id: row.id,
    kind: row.type === "income" ? "receber" : "pagar",
    description: row.description,
    amount: amountOf(row),
    frequency,
    intervalCount: row.interval_count,
    startDate,
    endDate,
    label: frequencyLabel(frequency, row.interval_count, startDate),
    nextOccurrence: scheduled ? dbDate(scheduled) : fallback,
    state,
    attention:
      state === "attention" && code !== null
        ? {
            code,
            message:
              ATTENTION_MESSAGES[code] ??
              ATTENTION_MESSAGES.INTERNAL_ERROR ??
              "",
          }
        : null,
    account: { id: row.account.id, name: row.account.name },
    category: {
      id: row.category.id,
      name: row.category.name,
      color: toCategoryColor(row.category.color),
      icon: toCategoryIcon(row.category.icon),
    },
    assignedMember: row.assigned_member
      ? {
          id: row.assigned_member.id,
          displayName: memberDisplayName(
            row.assigned_member.profiles?.display_name ?? null,
          ),
        }
      : null,
    canManage: canManageTransaction(viewer.role, row.created_by, viewer.userId),
  };
}

export async function listRecurrences(
  filters: RecurrenceFilters,
): Promise<RecurrenceView[]> {
  const membership = await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  const f = recurrenceFiltersSchema.parse(filters);
  const now = today();
  // Situação filtrada no SQL; páginas pequenas (cada uma busca as próximas pendentes só das suas
  // séries), então nem o `.in()` nem o limite de 1000 linhas do PostgREST truncam o resultado.
  const views: RecurrenceView[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = await selectRecurrencesPage(
      supabase,
      f.situacao,
      now,
      from,
      from + PAGE_SIZE - 1,
    );
    const nextPending = await selectNextPendingByRecurrence(
      supabase,
      rows.map((r) => r.id),
      now,
    );
    for (const r of rows) views.push(toView(r, nextPending, membership, now));
    if (rows.length < PAGE_SIZE) break;
  }
  return views;
}

export async function getRecurrence(
  id: string,
): Promise<RecurrenceView | null> {
  const membership = await requireMembership();
  // Id que não é uuid não existe (evita o erro 22P02 do Postgres).
  if (!UUID.test(id)) return null;
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  const row = await selectRecurrenceById(supabase, id);
  if (!row) return null;
  const now = today();
  const nextPending = await selectNextPendingByRecurrence(supabase, [id], now);
  return toView(row, nextPending, membership, now);
}
