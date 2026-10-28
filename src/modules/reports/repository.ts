import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/dates";
import { fromDbNumeric, type Cents } from "@/lib/money";
import type { Database } from "@/types/database";

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
