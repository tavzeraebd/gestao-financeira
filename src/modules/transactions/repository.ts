import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { dbDate, numericParam } from "@/lib/supabase/db-values";
import {
  toCategoryColor,
  toCategoryIcon,
} from "@/modules/categories/constants";
import {
  canManageTransaction,
  type FamilyRole,
} from "@/modules/family/permissions";
import {
  NO_MEMBER_FILTER,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  TYPE_FILTER_VALUES,
  type TransactionStatus,
  type TransactionType,
} from "@/modules/transactions/constants";
import { directionOf } from "@/modules/transactions/domain/effect";
import type {
  HistoryEntry,
  HistoryField,
  TransactionFilters,
  TransactionListItem,
} from "@/modules/transactions/types";
import type { Database } from "@/types/database";
import { memberDisplayName } from "@/modules/family/domain/member-name";

type Client = SupabaseClient<Database>;

/** Montantes só com `::text` (contrato §3.2). Embeds pelos nomes de FK do contrato §3.1. */
const ITEM_COLUMNS =
  "id, type, description, amount::text, transaction_date, status, reversal_of_id, created_by, recurrence_id, " +
  "account:accounts!transactions_account_fk(id, name), " +
  "destination_account:accounts!transactions_destination_account_fk(id, name), " +
  "category:categories!transactions_category_fk(id, name, color, icon), " +
  "assigned_member:family_members!transactions_assigned_member_fk(id, profiles(display_name))";

type ItemRow = {
  id: string;
  type: string;
  description: string;
  amount: string;
  transaction_date: string;
  status: string;
  reversal_of_id: string | null;
  created_by: string;
  recurrence_id: string | null;
  account: { id: string; name: string } | null;
  destination_account: { id: string; name: string } | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  assigned_member: {
    id: string;
    profiles: { display_name: string | null } | null;
  } | null;
};

function toType(value: string): TransactionType {
  if (!(TRANSACTION_TYPES as readonly string[]).includes(value)) {
    throw new Error("Tipo de lançamento desconhecido no banco.");
  }
  return value as TransactionType;
}

function toStatus(value: string): TransactionStatus {
  if (!(TRANSACTION_STATUSES as readonly string[]).includes(value)) {
    throw new Error("Status de lançamento desconhecido no banco.");
  }
  return value as TransactionStatus;
}

export type ViewerContext = {
  role: FamilyRole;
  userId: string;
  accountFilterId?: string;
};

export function toListItem(
  row: ItemRow,
  viewer: ViewerContext,
): TransactionListItem {
  if (!row.account) throw new Error("Lançamento sem conta visível.");
  const type = toType(row.type);
  return {
    id: row.id,
    type,
    description: row.description,
    amount: fromDbNumeric(row.amount),
    direction: directionOf({
      type,
      isReversal: row.reversal_of_id !== null,
      accountId: row.account.id,
      destinationAccountId: row.destination_account?.id ?? null,
      accountFilterId: viewer.accountFilterId,
    }),
    transactionDate: dbDate(row.transaction_date),
    status: toStatus(row.status),
    account: { id: row.account.id, name: row.account.name },
    destinationAccount: row.destination_account
      ? { id: row.destination_account.id, name: row.destination_account.name }
      : null,
    category: row.category
      ? {
          id: row.category.id,
          name: row.category.name,
          color: toCategoryColor(row.category.color),
          icon: toCategoryIcon(row.category.icon),
        }
      : null,
    assignedMember: row.assigned_member
      ? {
          id: row.assigned_member.id,
          displayName: memberDisplayName(
            row.assigned_member.profiles?.display_name ?? null,
          ),
        }
      : null,
    reversalOfId: row.reversal_of_id,
    recurrenceId: row.recurrence_id,
    canManage: canManageTransaction(viewer.role, row.created_by, viewer.userId),
  };
}

/** `%`, `_` e `\` literais no `ilike`. O PostgREST troca `*` por `%`: aqui vira `_` (um caractere). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "_");
}

/** Id da categoria e das suas subcategorias (o filtro `categoria` inclui as filhas). */
export async function selectCategoryFamilyIds(
  supabase: Client,
  categoryId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("parent_id", categoryId);
  if (error) throw error;
  return [categoryId, ...data.map((c) => c.id)];
}

export async function selectTransactionPage(
  supabase: Client,
  filters: TransactionFilters,
  categoryIds: string[] | null,
  viewer: ViewerContext,
): Promise<{ items: TransactionListItem[]; total: number }> {
  const size = filters.por_pagina;

  const run = async (from: number, to: number) => {
    let query = supabase
      .from("transactions")
      .select(ITEM_COLUMNS, { count: "exact" })
      // Lançamentos são só efetivados; pendentes e cancelados vivem em /compromissos (ADR-0022 §6).
      .eq("status", "paid")
      .is("deleted_at", null);
    if (filters.de) query = query.gte("transaction_date", filters.de);
    if (filters.ate) query = query.lte("transaction_date", filters.ate);
    if (filters.tipo)
      query = query.eq("type", TYPE_FILTER_VALUES[filters.tipo]);
    // `conta` é uuid validado pelo schema: seguro dentro da expressão `or`.
    if (filters.conta) {
      query = query.or(
        `account_id.eq.${filters.conta},destination_account_id.eq.${filters.conta}`,
      );
    }
    if (categoryIds) query = query.in("category_id", categoryIds);
    if (filters.responsavel === NO_MEMBER_FILTER) {
      query = query.is("assigned_member_id", null);
    } else if (filters.responsavel) {
      query = query.eq("assigned_member_id", filters.responsavel);
    }
    if (filters.q) {
      query = query.ilike("description", `%${escapeLike(filters.q)}%`);
    }
    const byAmount = filters.ordem.startsWith("valor");
    const ascending = filters.ordem.endsWith("asc");
    query = query
      .order(byAmount ? "amount" : "transaction_date", { ascending })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    return query.range(from, to);
  };

  const first = (filters.pagina - 1) * size;
  const { data, error, count } = await run(first, first + size - 1);
  if (error) {
    // Página além da última: o PostgREST recusa o intervalo; o total sai de um intervalo mínimo.
    if (error.code === "PGRST103") {
      const probe = await run(0, 0);
      if (probe.error) throw probe.error;
      return { items: [], total: probe.count ?? 0 };
    }
    throw error;
  }
  return {
    items: (data as unknown as ItemRow[]).map((r) => toListItem(r, viewer)),
    total: count ?? 0,
  };
}

/** Efetivados não excluídos com data no período, do mais recente ao mais antigo. */
export async function selectRecentTransactions(
  supabase: Client,
  from: string,
  to: string,
  limit: number,
  viewer: ViewerContext,
): Promise<TransactionListItem[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(ITEM_COLUMNS)
    .eq("status", "paid")
    .is("deleted_at", null)
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as ItemRow[]).map((r) => toListItem(r, viewer));
}

export type RecurrenceEmbed = {
  id: string;
  frequency: string;
  interval_count: number;
  start_date: string;
};

/** Embed da série de origem (FK do contrato §3.1). */
export const RECURRENCE_EMBED =
  "recurrence:recurrences!transactions_recurrence_fk(id, frequency, interval_count, start_date)";

export type DetailRow = ItemRow & {
  notes: string | null;
  due_date: string | null;
  recurrence: RecurrenceEmbed | null;
  created_at: string;
  updated_at: string;
  creator: { id: string; display_name: string | null } | null;
};

export async function selectTransactionDetail(
  supabase: Client,
  id: string,
): Promise<DetailRow | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `${ITEM_COLUMNS}, notes, due_date, ${RECURRENCE_EMBED}, created_at, updated_at, creator:profiles!transactions_created_by_fk(id, display_name)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as DetailRow | null;
}

export async function selectActiveReversals(
  supabase: Client,
  originalId: string,
): Promise<{ id: string; amount: Cents; transactionDate: string }[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount::text, transaction_date")
    .eq("reversal_of_id", originalId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    amount: fromDbNumeric(r.amount),
    transactionDate: r.transaction_date,
  }));
}

export async function rpcPeriodSummary(
  supabase: Client,
  from: string,
  to: string,
): Promise<{ income: Cents; expense: Cents; result: Cents }> {
  const { data, error } = await supabase.rpc("period_summary", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error("period_summary não retornou linha.");
  return {
    income: fromDbNumeric(row.income),
    expense: fromDbNumeric(row.expense),
    result: fromDbNumeric(row.result),
  };
}

const HISTORY_FIELDS: Record<string, HistoryField> = {
  amount: "amount",
  transaction_date: "transactionDate",
  account_id: "accountId",
  destination_account_id: "destinationAccountId",
  category_id: "categoryId",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asText(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toChanges(action: string, metadata: unknown): HistoryEntry["changes"] {
  if (!isRecord(metadata)) return [];
  if (action === "transaction.updated") {
    const changed = Array.isArray(metadata.changed) ? metadata.changed : [];
    const oldValues = isRecord(metadata.old) ? metadata.old : {};
    const newValues = isRecord(metadata.new) ? metadata.new : {};
    return changed.flatMap((column) => {
      const field =
        typeof column === "string" && Object.hasOwn(HISTORY_FIELDS, column)
          ? HISTORY_FIELDS[column]
          : undefined;
      return field && typeof column === "string"
        ? [
            {
              field,
              old: asText(oldValues[column]),
              new: asText(newValues[column]),
            },
          ]
        : [];
    });
  }
  if (action === "transaction.canceled") return [];
  if (action === "transaction.paid") {
    // `changed` ⊆ amount, account_id; `old` traz os valores de antes (a nova conta não é gravada).
    const changed = Array.isArray(metadata.changed) ? metadata.changed : [];
    const oldValues = isRecord(metadata.old) ? metadata.old : {};
    const paidOn = asText(metadata.transaction_date);
    const dueDate = asText(metadata.due_date);
    return [
      ...(changed.includes("amount")
        ? [
            {
              field: "amount" as const,
              old: asText(oldValues.amount),
              new: asText(metadata.amount),
            },
          ]
        : []),
      ...(changed.includes("account_id")
        ? [
            {
              field: "accountId" as const,
              old: asText(oldValues.account_id),
              new: null,
            },
          ]
        : []),
      ...(paidOn !== null && paidOn !== dueDate
        ? [{ field: "transactionDate" as const, old: dueDate, new: paidOn }]
        : []),
    ];
  }
  const amount = asText(metadata.amount);
  const date = asText(metadata.transaction_date);
  // Exclusão: valor e data de antes; estorno: valor e data do estorno criado.
  const deleted = action === "transaction.deleted";
  return [
    {
      field: "amount" as const,
      old: deleted ? amount : null,
      new: deleted ? null : amount,
    },
    {
      field: "transactionDate" as const,
      old: deleted ? date : null,
      new: deleted ? null : date,
    },
  ].filter((c) => (deleted ? c.old : c.new) !== null);
}

const HISTORY_ACTIONS = [
  "transaction.updated",
  "transaction.deleted",
  "transaction.reversed",
  "transaction.paid",
  "transaction.canceled",
] as const;

/** Só owner/admin leem (RLS de `audit_events`); para member a lista vem vazia. */
export async function selectTransactionHistory(
  supabase: Client,
  transactionId: string,
): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select(
      "id, action, created_at, metadata, actor:profiles!audit_events_actor_user_id_fkey(display_name)",
    )
    .eq("entity_type", "transaction")
    .eq("entity_id", transactionId)
    .in("action", [...HISTORY_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.flatMap((row) => {
    const action = HISTORY_ACTIONS.find((a) => a === row.action);
    if (!action) return [];
    return [
      {
        id: row.id,
        action,
        occurredAt: row.created_at,
        actorName: row.actor?.display_name ?? null,
        changes: toChanges(action, row.metadata),
      },
    ];
  });
}

export type TransactionWrite = {
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  assignedMemberId: string | null;
  description: string;
  amount: Cents;
  transactionDate: string;
  notes: string | null;
};

export async function selectTransactionHead(
  supabase: Client,
  id: string,
): Promise<{
  type: TransactionType;
  amount: Cents;
  description: string;
  accountId: string;
  categoryId: string | null;
  reversalOfId: string | null;
  status: TransactionStatus;
} | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "type, amount::text, description, account_id, category_id, reversal_of_id, status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    type: toType(data.type),
    amount: fromDbNumeric(data.amount),
    description: data.description,
    accountId: data.account_id,
    categoryId: data.category_id,
    reversalOfId: data.reversal_of_id,
    status: toStatus(data.status),
  };
}

export async function insertTransaction(
  supabase: Client,
  input: TransactionWrite & {
    familyId: string;
    type: TransactionType;
    reversalOfId: string | null;
    idempotencyKey: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      family_id: input.familyId,
      type: input.type,
      account_id: input.accountId,
      destination_account_id: input.destinationAccountId,
      category_id: input.categoryId,
      assigned_member_id: input.assignedMemberId,
      description: input.description,
      amount: numericParam(input.amount),
      transaction_date: input.transactionDate,
      status: "paid",
      notes: input.notes,
      reversal_of_id: input.reversalOfId,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function selectIdByIdempotencyKey(
  supabase: Client,
  familyId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("family_id", familyId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Devolve quantas linhas o update alcançou (0 = a RLS negou). */
export async function updateTransactionRow(
  supabase: Client,
  id: string,
  input: TransactionWrite,
): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      account_id: input.accountId,
      destination_account_id: input.destinationAccountId,
      category_id: input.categoryId,
      assigned_member_id: input.assignedMemberId,
      description: input.description,
      amount: numericParam(input.amount),
      transaction_date: input.transactionDate,
      notes: input.notes,
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

/** O trigger fixa `deleted_at = now()` e `deleted_by`. */
export async function softDeleteTransaction(
  supabase: Client,
  id: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}
