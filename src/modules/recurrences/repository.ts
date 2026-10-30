import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { dbDate, numericParam } from "@/lib/supabase/db-values";
import type { Database } from "@/types/database";
import {
  FREQUENCIES,
  type Frequency,
  type RecurrenceSituation,
} from "./constants";

type Client = SupabaseClient<Database>;

/** Montantes só com `::text` (contrato §3.2). Embeds pelos nomes de FK do contrato §3.1. */
const COLUMNS =
  "id, type, description, amount::text, frequency, interval_count, start_date, end_date, " +
  "next_occurrence_date, payroll_deduction, is_active, last_failure_code, created_by, " +
  "account:accounts!recurrences_account_fk(id, name), " +
  "category:categories!recurrences_category_fk(id, name, color, icon), " +
  "assigned_member:family_members!recurrences_assigned_member_fk(id, profiles(display_name))";

export type RecurrenceRow = {
  id: string;
  type: string;
  description: string;
  amount: string;
  frequency: string;
  interval_count: number;
  start_date: string;
  end_date: string | null;
  next_occurrence_date: string;
  payroll_deduction: boolean;
  is_active: boolean;
  last_failure_code: string | null;
  created_by: string;
  account: { id: string; name: string } | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  assigned_member: {
    id: string;
    profiles: { display_name: string | null } | null;
  } | null;
};

export function toFrequency(value: string): Frequency {
  if (!(FREQUENCIES as readonly string[]).includes(value)) {
    throw new Error("Frequência desconhecida no banco.");
  }
  return value as Frequency;
}

/**
 * Uma página de séries da situação pedida (filtrada no SQL, mesma regra de `stateOf`: encerrada
 * vence pausada). `from`/`to` são índices inclusivos do `.range()`.
 */
export async function selectRecurrencesPage(
  supabase: Client,
  situacao: RecurrenceSituation,
  now: string,
  from: number,
  to: number,
): Promise<RecurrenceRow[]> {
  let query = supabase.from("recurrences").select(COLUMNS);
  if (situacao === "encerradas") {
    query = query.lt("end_date", now);
  } else {
    query = query
      .eq("is_active", situacao === "ativas")
      .or(`end_date.is.null,end_date.gte.${now}`);
  }
  const { data, error } = await query
    .order("description", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) throw error;
  return data as unknown as RecurrenceRow[];
}

export async function selectRecurrenceById(
  supabase: Client,
  id: string,
): Promise<RecurrenceRow | null> {
  const { data, error } = await supabase
    .from("recurrences")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as RecurrenceRow | null;
}

/** Menor ocorrência `pending` com data ≥ `from` por série (agenda ainda por vir). */
export async function selectNextPendingByRecurrence(
  supabase: Client,
  recurrenceIds: string[],
  from: string,
): Promise<Map<string, string>> {
  const next = new Map<string, string>();
  if (recurrenceIds.length === 0) return next;
  const { data, error } = await supabase
    .from("transactions")
    .select("recurrence_id, transaction_date")
    .in("recurrence_id", recurrenceIds)
    .eq("status", "pending")
    .is("deleted_at", null)
    .gte("transaction_date", from)
    .order("transaction_date", { ascending: true });
  if (error) throw error;
  for (const row of data) {
    if (row.recurrence_id && !next.has(row.recurrence_id)) {
      next.set(row.recurrence_id, dbDate(row.transaction_date));
    }
  }
  return next;
}

export type RecurrenceSeriesWrite = {
  description: string;
  amount: Cents;
  accountId: string;
  categoryId: string;
  assignedMemberId: string | null;
  endDate: string | null;
  payrollDeduction: boolean;
};

/** Devolve quantas linhas o update alcançou (0 = a RLS negou). A propagação é do trigger. */
export async function updateRecurrenceRow(
  supabase: Client,
  id: string,
  input: RecurrenceSeriesWrite,
): Promise<number> {
  const { data, error } = await supabase
    .from("recurrences")
    .update({
      description: input.description,
      amount: numericParam(input.amount),
      account_id: input.accountId,
      category_id: input.categoryId,
      assigned_member_id: input.assignedMemberId,
      end_date: input.endDate,
      payroll_deduction: input.payrollDeduction,
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function setRecurrenceActive(
  supabase: Client,
  id: string,
  isActive: boolean,
): Promise<number> {
  const { data, error } = await supabase
    .from("recurrences")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function setRecurrenceEndDate(
  supabase: Client,
  id: string,
  endDate: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("recurrences")
    .update({ end_date: endDate })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

/** `materialize_recurrences()`: quantas ocorrências criou. Sem parâmetros: a família vem do banco. */
export async function rpcMaterializeRecurrences(
  supabase: Client,
): Promise<number> {
  const { data, error } = await supabase.rpc("materialize_recurrences");
  if (error) throw error;
  return data;
}

export function amountOf(row: Pick<RecurrenceRow, "amount">): Cents {
  return fromDbNumeric(row.amount);
}
