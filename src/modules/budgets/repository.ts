import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { numericParam } from "@/lib/supabase/db-values";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Montantes só com `::text` (contrato §3.2). Embed pelo nome de FK do contrato §3.1. */
const COLUMNS =
  "id, category_id, amount_limit::text, start_month, end_month, archived_at, " +
  "category:categories!budgets_category_fk(id, name, color, icon, archived_at)";

export type BudgetRow = {
  id: string;
  category_id: string | null;
  amount_limit: string;
  start_month: string;
  end_month: string | null;
  archived_at: string | null;
  category: {
    id: string;
    name: string;
    color: string;
    icon: string;
    archived_at: string | null;
  } | null;
};

export async function selectBudgets(
  supabase: Client,
  archived: boolean,
): Promise<BudgetRow[]> {
  const base = supabase.from("budgets").select(COLUMNS);
  const { data, error } = await (
    archived
      ? base.not("archived_at", "is", null)
      : base.is("archived_at", null)
  )
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data as unknown as BudgetRow[];
}

export async function selectBudgetById(
  supabase: Client,
  id: string,
): Promise<BudgetRow | null> {
  const { data, error } = await supabase
    .from("budgets")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as BudgetRow | null;
}

export type BudgetProgressRow = {
  budgetId: string;
  month: string;
  spent: Cents;
  committed: Cents;
};

/** D14 numa chamada só (até 12 meses). Valores em `text`. */
export async function rpcBudgetProgress(
  supabase: Client,
  fromMonth: string,
  toMonth: string,
): Promise<BudgetProgressRow[]> {
  const { data, error } = await supabase.rpc("budget_progress", {
    p_from_month: fromMonth,
    p_to_month: toMonth,
  });
  if (error) throw error;
  return data.map((r) => ({
    budgetId: r.budget_id,
    month: r.month,
    spent: fromDbNumeric(r.spent),
    committed: fromDbNumeric(r.committed),
  }));
}

export async function insertBudget(
  supabase: Client,
  input: {
    familyId: string;
    categoryId: string | null;
    amountLimit: Cents;
    startMonth: string;
    endMonth: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("budgets")
    .insert({
      family_id: input.familyId,
      category_id: input.categoryId,
      amount_limit: numericParam(input.amountLimit),
      start_month: input.startMonth,
      end_month: input.endMonth,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Devolve quantas linhas o update alcançou (0 = a RLS negou). */
export async function updateBudgetRow(
  supabase: Client,
  id: string,
  input: { amountLimit: Cents; endMonth: string | null },
): Promise<number> {
  const { data, error } = await supabase
    .from("budgets")
    .update({
      amount_limit: numericParam(input.amountLimit),
      end_month: input.endMonth,
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function setBudgetArchivedAt(
  supabase: Client,
  id: string,
  archivedAt: string | null,
): Promise<number> {
  const { data, error } = await supabase
    .from("budgets")
    .update({ archived_at: archivedAt })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}
