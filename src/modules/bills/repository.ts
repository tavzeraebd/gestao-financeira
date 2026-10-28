import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type ISODate } from "@/lib/dates";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { dbDate, numericParam } from "@/lib/supabase/db-values";
import {
  toCategoryColor,
  toCategoryIcon,
} from "@/modules/categories/constants";
import { canManageTransaction, canPayBill } from "@/modules/family/permissions";
import type { FamilyRole } from "@/modules/family/permissions";
import { FREQUENCIES, type Frequency } from "@/modules/recurrences/constants";
import { frequencyLabel } from "@/modules/recurrences/domain/labels";
import {
  TRANSACTION_STATUSES,
  type TransactionStatus,
} from "@/modules/transactions/constants";
import {
  RECURRENCE_EMBED,
  type RecurrenceEmbed,
} from "@/modules/transactions/repository";
import type { Database } from "@/types/database";
import { BILL_KIND_TO_TYPE, type BillKind } from "./constants";
import { billStatusOf } from "./domain/status";
import type { BillFilters, BillListItem, BillsSummary } from "./types";
import { memberDisplayName } from "@/modules/family/domain/member-name";

type Client = SupabaseClient<Database>;

/** Montantes só com `::text`. Embeds pelos nomes de FK do contrato §3.1. */
const BILL_COLUMNS =
  "id, type, description, amount::text, transaction_date, due_date, status, created_by, " +
  "account:accounts!transactions_account_fk(id, name), " +
  "category:categories!transactions_category_fk(id, name, color, icon), " +
  "assigned_member:family_members!transactions_assigned_member_fk(id, user_id, profiles(display_name)), " +
  RECURRENCE_EMBED;

type BillRow = {
  id: string;
  type: string;
  description: string;
  amount: string;
  transaction_date: string;
  due_date: string | null;
  status: string;
  created_by: string;
  account: { id: string; name: string } | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  assigned_member: {
    id: string;
    user_id: string | null;
    profiles: { display_name: string | null } | null;
  } | null;
  recurrence: RecurrenceEmbed | null;
};

export type BillViewer = { role: FamilyRole; userId: string };

export function toFrequency(value: string): Frequency {
  if (!(FREQUENCIES as readonly string[]).includes(value)) {
    throw new Error("Frequência desconhecida no banco.");
  }
  return value as Frequency;
}

function toStatus(value: string): TransactionStatus {
  if (!(TRANSACTION_STATUSES as readonly string[]).includes(value)) {
    throw new Error("Status de lançamento desconhecido no banco.");
  }
  return value as TransactionStatus;
}

function toKind(type: string): BillKind {
  if (type === "expense") return "pagar";
  if (type === "income") return "receber";
  throw new Error("Compromisso com tipo inesperado no banco.");
}

export function toBillItem(
  row: BillRow,
  viewer: BillViewer,
  today: ISODate,
): BillListItem {
  if (!row.account) throw new Error("Compromisso sem conta visível.");
  if (!row.category) throw new Error("Compromisso sem categoria visível.");
  const status = toStatus(row.status);
  const transactionDate = dbDate(row.transaction_date);
  const dueDate = row.due_date ? dbDate(row.due_date) : null;
  const derived = billStatusOf({ status, transactionDate, dueDate }, today);
  const pending = status === "pending";
  const manage = canManageTransaction(
    viewer.role,
    row.created_by,
    viewer.userId,
  );
  return {
    id: row.id,
    kind: toKind(row.type),
    description: row.description,
    amount: fromDbNumeric(row.amount),
    dueDate: pending ? transactionDate : (dueDate ?? transactionDate),
    paidOn: status === "paid" ? transactionDate : null,
    status: derived.status,
    days: derived.days,
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
    canPay:
      pending &&
      canPayBill(
        viewer.role,
        row.created_by,
        row.assigned_member?.user_id ?? null,
        viewer.userId,
      ),
    canEdit: pending && manage,
    canCancel: pending && manage,
  };
}

export async function selectBillPage(
  supabase: Client,
  filters: BillFilters,
  viewer: BillViewer,
  today: ISODate,
): Promise<{ items: BillListItem[]; total: number }> {
  const size = filters.por_pagina;
  const open =
    filters.situacao === "abertos" || filters.situacao === "vencidos";
  // Vencimento: `transaction_date` enquanto pendente; depois do pagamento/cancelamento, `due_date`.
  const dueColumn = open ? "transaction_date" : "due_date";

  const run = async (from: number, to: number) => {
    let query = supabase
      .from("transactions")
      .select(BILL_COLUMNS, { count: "exact" })
      .is("deleted_at", null);
    query = filters.tipo
      ? query.eq("type", BILL_KIND_TO_TYPE[filters.tipo])
      : query.in("type", ["income", "expense"]);
    switch (filters.situacao) {
      case "abertos":
        query = query.eq("status", "pending");
        break;
      case "vencidos":
        query = query.eq("status", "pending").lt("transaction_date", today);
        break;
      case "pagos":
        query = query.eq("status", "paid").not("due_date", "is", null);
        break;
      case "cancelados":
        query = query.eq("status", "canceled");
        break;
    }
    if (filters.de) query = query.gte(dueColumn, filters.de);
    if (filters.ate) query = query.lte(dueColumn, filters.ate);
    if (filters.serie) query = query.eq("recurrence_id", filters.serie);
    // Pagos: pagamento decrescente; cancelados: vencimento decrescente; abertos: vencimento crescente.
    query = open
      ? query.order("transaction_date", { ascending: true })
      : query.order(
          filters.situacao === "pagos" ? "transaction_date" : "due_date",
          { ascending: false },
        );
    query = query
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
    items: (data as unknown as BillRow[]).map((r) =>
      toBillItem(r, viewer, today),
    ),
    total: count ?? 0,
  };
}

/** D19: `pending` com vencimento até `today + days` (vencidos incluídos), vencimento crescente. */
export async function selectUpcomingBills(
  supabase: Client,
  days: number,
  limit: number,
  viewer: BillViewer,
  today: ISODate,
): Promise<BillListItem[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(BILL_COLUMNS)
    .eq("status", "pending")
    .is("deleted_at", null)
    .in("type", ["income", "expense"])
    .lte("transaction_date", addDays(today, days))
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as BillRow[]).map((r) =>
    toBillItem(r, viewer, today),
  );
}

export type BillDetailRow = BillRow & {
  notes: string | null;
  created_at: string;
  creator: { id: string; display_name: string | null } | null;
};

/** `null` para inexistente, de outra família (RLS), excluído, transferência ou `paid` sem `due_date`. */
export async function selectBillDetail(
  supabase: Client,
  id: string,
): Promise<BillDetailRow | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `${BILL_COLUMNS}, notes, created_at, creator:profiles!transactions_created_by_fk(id, display_name)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .in("type", ["income", "expense"])
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as BillDetailRow | null;
  if (row && row.status === "paid" && row.due_date === null) return null;
  return row;
}

export async function rpcPendingSummary(
  supabase: Client,
): Promise<BillsSummary> {
  const { data, error } = await supabase.rpc("pending_summary");
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error("pending_summary não retornou linha.");
  return {
    payable: fromDbNumeric(row.payable),
    receivable: fromDbNumeric(row.receivable),
    overduePayable: fromDbNumeric(row.overdue_payable),
    overdueReceivable: fromDbNumeric(row.overdue_receivable),
    overdueCount: row.overdue_count,
  };
}

export type BillWrite = {
  accountId: string;
  categoryId: string;
  assignedMemberId: string | null;
  description: string;
  amount: Cents;
  dueDate: string;
  notes: string | null;
};

/** Compromisso avulso: `pending`; o trigger fixa `due_date = transaction_date`. */
export async function insertPendingTransaction(
  supabase: Client,
  input: BillWrite & {
    familyId: string;
    type: "expense" | "income";
    idempotencyKey: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      family_id: input.familyId,
      type: input.type,
      account_id: input.accountId,
      category_id: input.categoryId,
      assigned_member_id: input.assignedMemberId,
      description: input.description,
      amount: numericParam(input.amount),
      transaction_date: input.dueDate,
      status: "pending",
      notes: input.notes,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function insertRecurrence(
  supabase: Client,
  input: Omit<BillWrite, "notes" | "dueDate"> & {
    familyId: string;
    type: "expense" | "income";
    frequency: Frequency;
    intervalCount: number;
    startDate: string;
    endDate: string | null;
    idempotencyKey: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("recurrences")
    .insert({
      family_id: input.familyId,
      type: input.type,
      account_id: input.accountId,
      category_id: input.categoryId,
      assigned_member_id: input.assignedMemberId,
      description: input.description,
      amount: numericParam(input.amount),
      frequency: input.frequency,
      interval_count: input.intervalCount,
      start_date: input.startDate,
      end_date: input.endDate,
      idempotency_key: input.idempotencyKey,
      // `next_occurrence_date` é do banco (fora dos grants): o trigger a define no insert.
    } as Database["public"]["Tables"]["recurrences"]["Insert"])
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function selectRecurrenceIdByIdempotencyKey(
  supabase: Client,
  familyId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("recurrences")
    .select("id")
    .eq("family_id", familyId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Cabeça mínima para decidir NOT_FOUND / INVALID_STATUS_TRANSITION antes de editar. */
export async function selectBillStatus(
  supabase: Client,
  id: string,
): Promise<TransactionStatus | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .in("type", ["income", "expense"])
    .maybeSingle();
  if (error) throw error;
  return data ? toStatus(data.status) : null;
}

/** Edita só campos de dados de um compromisso `pending` (nunca `status`). Devolve as linhas alcançadas. */
export async function updatePendingRow(
  supabase: Client,
  id: string,
  input: BillWrite,
): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      account_id: input.accountId,
      category_id: input.categoryId,
      assigned_member_id: input.assignedMemberId,
      description: input.description,
      amount: numericParam(input.amount),
      transaction_date: input.dueDate,
      notes: input.notes,
    })
    .eq("id", id)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function rpcPayPendingTransaction(
  supabase: Client,
  input: {
    transactionId: string;
    paidOn: string;
    amount: Cents;
    accountId: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc("pay_pending_transaction", {
    p_transaction_id: input.transactionId,
    p_paid_on: input.paidOn,
    p_amount: numericParam(input.amount),
    p_account_id: input.accountId,
  });
  if (error) throw error;
}

export async function rpcCancelPendingTransaction(
  supabase: Client,
  transactionId: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_pending_transaction", {
    p_transaction_id: transactionId,
  });
  if (error) throw error;
}

export async function rpcMaterializeRecurrences(
  supabase: Client,
): Promise<number> {
  const { data, error } = await supabase.rpc("materialize_recurrences");
  if (error) throw error;
  return data;
}
