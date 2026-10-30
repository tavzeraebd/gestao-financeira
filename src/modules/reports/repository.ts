import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/dates";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { dbDate } from "@/lib/supabase/db-values";
import { toFrequency } from "@/modules/recurrences/repository";
import type { Database } from "@/types/database";
import { MAX_COMMITMENT_ROWS } from "./constants";
import type { CommitmentEntry, CommitmentSeries } from "./types";

type Client = SupabaseClient<Database>;

/** D1 em `asOf` para todas as contas visíveis (`account_balances(p_as_of)`, saldo em `text`). */
export async function rpcBalancesAsOf(
  supabase: Client,
  asOf: ISODate,
): Promise<Map<string, Cents>> {
  const { data, error } = await supabase.rpc("account_balances", {
    p_as_of: asOf,
  });
  if (error) throw error;
  return new Map(data.map((r) => [r.account_id, fromDbNumeric(r.balance)]));
}

type CommitmentTypeColumn = "income" | "expense";

function toCommitmentType(value: string): CommitmentTypeColumn {
  if (value === "income" || value === "expense") return value;
  throw new Error("Compromisso com tipo inesperado no banco.");
}

/**
 * Compromissos em aberto (`pending`, não excluídos, receita ou despesa) com data antes de `before`
 * (vencidos incluídos). A RLS decide a família; nenhum filtro de família é enviado.
 */
export async function selectPendingCommitments(
  supabase: Client,
  before: ISODate,
): Promise<CommitmentEntry[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, description, amount::text, transaction_date, category_id")
    .eq("status", "pending")
    .is("deleted_at", null)
    .in("type", ["income", "expense"])
    .lt("transaction_date", before)
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_COMMITMENT_ROWS);
  if (error) throw error;
  return (
    data as unknown as {
      type: string;
      description: string;
      amount: string;
      transaction_date: string;
      category_id: string;
    }[]
  ).map((row) => ({
    type: toCommitmentType(row.type),
    description: row.description,
    amount: fromDbNumeric(row.amount),
    date: dbDate(row.transaction_date),
    categoryId: row.category_id,
  }));
}

/** Séries recorrentes ativas (a pausada não compromete o futuro). */
export async function selectActiveCommitmentSeries(
  supabase: Client,
): Promise<CommitmentSeries[]> {
  const { data, error } = await supabase
    .from("recurrences")
    .select(
      "type, description, amount::text, frequency, interval_count, start_date, end_date, next_occurrence_date, category_id, payroll_deduction",
    )
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(MAX_COMMITMENT_ROWS);
  if (error) throw error;
  return (
    data as unknown as {
      type: string;
      description: string;
      amount: string;
      frequency: string;
      interval_count: number;
      start_date: string;
      end_date: string | null;
      next_occurrence_date: string;
      category_id: string;
      payroll_deduction: boolean;
    }[]
  ).map((row) => ({
    type: toCommitmentType(row.type),
    description: row.description,
    amount: fromDbNumeric(row.amount),
    frequency: toFrequency(row.frequency),
    intervalCount: row.interval_count,
    startDate: dbDate(row.start_date),
    endDate: row.end_date ? dbDate(row.end_date) : null,
    nextOccurrenceDate: dbDate(row.next_occurrence_date),
    categoryId: row.category_id,
    payrollDeduction: row.payroll_deduction,
  }));
}

/** D4 por categoria (subcategoria somada à pai), em ordem decrescente. */
export async function rpcCategoryTotals(
  supabase: Client,
  from: ISODate,
  to: ISODate,
  type: "income" | "expense",
): Promise<{ categoryId: string; amount: Cents }[]> {
  const { data, error } = await supabase.rpc("category_totals", {
    p_from: from,
    p_to: to,
    p_type: type,
  });
  if (error) throw error;
  return data.map((r) => ({
    categoryId: r.category_id,
    amount: fromDbNumeric(r.amount),
  }));
}

/** D17: um mês por linha, todos presentes, em ordem crescente. */
export async function rpcMonthlyCashFlow(
  supabase: Client,
  from: ISODate,
  to: ISODate,
): Promise<{ month: string; income: Cents; expense: Cents; result: Cents }[]> {
  const { data, error } = await supabase.rpc("monthly_cash_flow", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data.map((r) => ({
    month: r.month,
    income: fromDbNumeric(r.income),
    expense: fromDbNumeric(r.expense),
    result: fromDbNumeric(r.result),
  }));
}

/** Existe algum lançamento efetivado não excluído, em toda a história? */
export async function selectHasPaidTransaction(
  supabase: Client,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("status", "paid")
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}

/** D22: movimento por conta (entradas, saídas e saldos nas duas pontas). */
export async function rpcAccountFlows(
  supabase: Client,
  from: ISODate,
  to: ISODate,
): Promise<
  {
    accountId: string;
    opening: Cents;
    inflow: Cents;
    outflow: Cents;
    closing: Cents;
  }[]
> {
  const { data, error } = await supabase.rpc("account_flows", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data.map((r) => ({
    accountId: r.account_id,
    opening: fromDbNumeric(r.opening),
    inflow: fromDbNumeric(r.inflow),
    outflow: fromDbNumeric(r.outflow),
    closing: fromDbNumeric(r.closing),
  }));
}

/** D10: despesas por integrante; `memberId` nulo = sem responsável. */
export async function rpcMemberExpenseTotals(
  supabase: Client,
  from: ISODate,
  to: ISODate,
): Promise<{ memberId: string | null; amount: Cents }[]> {
  const { data, error } = await supabase.rpc("member_expense_totals", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data.map((r) => ({
    memberId: (r.member_id as string | null) ?? null,
    amount: fromDbNumeric(r.amount),
  }));
}
