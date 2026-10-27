import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/dates";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { numericParam } from "@/lib/supabase/db-values";
import type { Database } from "@/types/database";
import type { GoalStatus } from "./constants";

type Client = SupabaseClient<Database>;

/** Montantes só com `::text` (contrato §3.2). */
const GOAL_COLUMNS =
  "id, name, description, target_amount::text, target_date, icon, status, completed_at, created_at";

export type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  target_amount: string;
  target_date: string | null;
  icon: string;
  status: string;
  completed_at: string | null;
  created_at: string;
};

export async function selectGoals(
  supabase: Client,
  statuses: readonly GoalStatus[] | null,
): Promise<GoalRow[]> {
  let query = supabase.from("goals").select(GOAL_COLUMNS);
  if (statuses) query = query.in("status", [...statuses]);
  // Com data-alvo primeiro (crescente), sem data por último; depois a mais antiga.
  const { data, error } = await query
    .order("target_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data as unknown as GoalRow[];
}

export async function selectGoalById(
  supabase: Client,
  id: string,
): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as GoalRow | null;
}

export type GoalSummaryRow = {
  goalId: string;
  saved: Cents;
  deposits: Cents;
  withdrawals: Cents;
};

/** D9 numa chamada só: acumulado (todas as datas) e movimento da janela `[from, to]`. */
export async function rpcGoalSummary(
  supabase: Client,
  from: ISODate,
  to: ISODate,
): Promise<GoalSummaryRow[]> {
  const { data, error } = await supabase.rpc("goal_summary", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data.map((r) => ({
    goalId: r.goal_id,
    saved: fromDbNumeric(r.saved),
    deposits: fromDbNumeric(r.deposits),
    withdrawals: fromDbNumeric(r.withdrawals),
  }));
}

export type GoalWrite = {
  name: string;
  description: string | null;
  targetAmount: Cents;
  targetDate: string | null;
  icon: string;
};

export async function insertGoal(
  supabase: Client,
  input: GoalWrite & { familyId: string; idempotencyKey: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      family_id: input.familyId,
      name: input.name,
      description: input.description,
      target_amount: numericParam(input.targetAmount),
      target_date: input.targetDate,
      icon: input.icon,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function selectGoalIdByIdempotencyKey(
  supabase: Client,
  familyId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("goals")
    .select("id")
    .eq("family_id", familyId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Devolve quantas linhas o update alcançou (0 = a RLS negou). */
export async function updateGoalRow(
  supabase: Client,
  id: string,
  input: GoalWrite,
): Promise<number> {
  const { data, error } = await supabase
    .from("goals")
    .update({
      name: input.name,
      description: input.description,
      target_amount: numericParam(input.targetAmount),
      target_date: input.targetDate,
      icon: input.icon,
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

/** `completed_at` é do trigger; aqui só se envia o status. */
export async function setGoalStatusRow(
  supabase: Client,
  id: string,
  status: GoalStatus,
): Promise<number> {
  const { data, error } = await supabase
    .from("goals")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

const CONTRIBUTION_COLUMNS =
  "id, kind, amount::text, contribution_date, notes, created_by, member_id, " +
  "member:family_members!goal_contributions_member_fk(id, profiles(display_name))";

export type ContributionRow = {
  id: string;
  kind: string;
  amount: string;
  contribution_date: string;
  notes: string | null;
  created_by: string;
  member_id: string;
  member: {
    id: string;
    profiles: { display_name: string | null } | null;
  } | null;
};

export async function selectContributionPage(
  supabase: Client,
  goalId: string,
  page: number,
  size: number,
): Promise<{ items: ContributionRow[]; total: number }> {
  const run = (from: number, to: number) =>
    supabase
      .from("goal_contributions")
      .select(CONTRIBUTION_COLUMNS, { count: "exact" })
      .eq("goal_id", goalId)
      .is("deleted_at", null)
      .order("contribution_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

  const first = (page - 1) * size;
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
  return { items: data as unknown as ContributionRow[], total: count ?? 0 };
}

export type ActiveMemberRow = {
  id: string;
  profiles: { display_name: string | null } | null;
};

export async function selectActiveMembers(
  supabase: Client,
): Promise<ActiveMemberRow[]> {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, profiles(display_name)")
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data as unknown as ActiveMemberRow[];
}

export async function insertContribution(
  supabase: Client,
  input: {
    familyId: string;
    goalId: string;
    memberId: string;
    kind: string;
    amount: Cents;
    contributionDate: string;
    notes: string | null;
    idempotencyKey: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("goal_contributions")
    .insert({
      family_id: input.familyId,
      goal_id: input.goalId,
      member_id: input.memberId,
      kind: input.kind,
      amount: numericParam(input.amount),
      contribution_date: input.contributionDate,
      notes: input.notes,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function selectContributionIdByIdempotencyKey(
  supabase: Client,
  familyId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("goal_contributions")
    .select("id")
    .eq("family_id", familyId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Aporte visível e não excluído? */
export async function selectContributionExists(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("goal_contributions")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** O trigger fixa `deleted_at = now()` e `deleted_by`. */
export async function softDeleteContribution(
  supabase: Client,
  id: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("goal_contributions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}
