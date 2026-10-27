import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/dates";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { dbDate } from "@/lib/supabase/db-values";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** D9: `saved` de todas as datas; depósitos e retiradas só da janela `[from, to]`. */
export async function rpcGoalSummary(
  supabase: Client,
  from: ISODate,
  to: ISODate,
): Promise<Map<string, { saved: Cents; deposits: Cents; withdrawals: Cents }>> {
  const { data, error } = await supabase.rpc("goal_summary", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return new Map(
    data.map((r) => [
      r.goal_id,
      {
        saved: fromDbNumeric(r.saved),
        deposits: fromDbNumeric(r.deposits),
        withdrawals: fromDbNumeric(r.withdrawals),
      },
    ]),
  );
}

export type ProjectedMonth = {
  month: ISODate;
  pendingIncome: Cents;
  pendingExpense: Cents;
  recurringIncome: Cents;
  recurringExpense: Cents;
};

/** D15: previsto por mês (pendentes + ocorrências virtuais das séries), `months` linhas a partir do mês de hoje. */
export async function rpcProjectedCashFlow(
  supabase: Client,
  months: number,
): Promise<ProjectedMonth[]> {
  const { data, error } = await supabase.rpc("projected_cash_flow", {
    p_months: months,
  });
  if (error) throw error;
  return data.map((r) => ({
    month: dbDate(r.month),
    pendingIncome: fromDbNumeric(r.pending_income),
    pendingExpense: fromDbNumeric(r.pending_expense),
    recurringIncome: fromDbNumeric(r.recurring_income),
    recurringExpense: fromDbNumeric(r.recurring_expense),
  }));
}

export type GoalBaseRow = {
  id: string;
  name: string;
  target: Cents;
  targetDate: ISODate | null;
};

/** Metas `active` visíveis (RLS), data-alvo crescente e sem data por último. */
export async function selectActiveGoals(
  supabase: Client,
): Promise<GoalBaseRow[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("id, name, target_amount::text, target_date, created_at")
    .eq("status", "active")
    .order("target_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      name: string;
      target_amount: string;
      target_date: string | null;
    }[]
  ).map((g) => ({
    id: g.id,
    name: g.name,
    target: fromDbNumeric(g.target_amount),
    targetDate: g.target_date ? dbDate(g.target_date) : null,
  }));
}

export async function selectCategoryRows(
  supabase: Client,
  ids: string[],
): Promise<Map<string, { name: string; color: string; icon: string }>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, color, icon")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    data.map((c) => [c.id, { name: c.name, color: c.color, icon: c.icon }]),
  );
}
