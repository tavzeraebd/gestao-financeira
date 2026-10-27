import "server-only";
import { addDays, today, type ISODate } from "@/lib/dates";
import { fromDbNumeric, subCents, type Cents } from "@/lib/money";
import { dbDate } from "@/lib/supabase/db-values";
import { createClient } from "@/lib/supabase/server";
import { memberDisplayName } from "@/modules/family/domain/member-name";
import {
  canDeleteContribution,
  can,
  type FamilyRole,
} from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";
import {
  CONTRIBUTIONS_PAGE_SIZE,
  CONTRIBUTION_KINDS,
  GOAL_STATUSES,
  PACE_WINDOW_DAYS,
  toGoalIcon,
  type GoalFilter,
  type GoalStatus,
} from "./constants";
import { estimateGoal } from "./domain/estimate";
import { goalProgress } from "./domain/progress";
import {
  rpcGoalSummary,
  selectActiveMembers,
  selectContributionPage,
  selectGoalById,
  selectGoals,
  type ContributionRow,
  type GoalRow,
  type GoalSummaryRow,
} from "./repository";
import { goalFiltersSchema } from "./schemas";
import type {
  ContributionView,
  GoalDetail,
  GoalView,
  MemberRef,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES_BY_FILTER: Record<GoalFilter, readonly GoalStatus[] | null> = {
  ativas: ["active", "paused"],
  concluidas: ["completed"],
  todas: null,
};

function toStatus(value: string): GoalStatus {
  if (!(GOAL_STATUSES as readonly string[]).includes(value)) {
    throw new Error("Situação de meta desconhecida no banco.");
  }
  return value as GoalStatus;
}

type Viewer = { role: FamilyRole; userId: string; memberId: string };

function toGoalView(
  row: GoalRow,
  summary: GoalSummaryRow | undefined,
  now: ISODate,
  viewer: Viewer,
): GoalView {
  const target = fromDbNumeric(row.target_amount);
  const saved = summary?.saved ?? (0 as Cents);
  const net = summary
    ? subCents(summary.deposits, summary.withdrawals)
    : (0 as Cents);
  const targetDate = row.target_date === null ? null : dbDate(row.target_date);
  const status = toStatus(row.status);
  const progress = goalProgress(target, saved);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: toGoalIcon(row.icon),
    status,
    targetAmount: target,
    saved,
    remaining: progress.remaining,
    percent: progress.percent,
    targetDate,
    estimate: estimateGoal({
      target,
      saved,
      netInWindow: net,
      targetDate,
      today: now,
    }),
    completedAt: row.completed_at,
    canManage: can(viewer.role, "goal.manage"),
    canContribute: status === "active",
  };
}

function toContributionView(
  row: ContributionRow,
  viewer: Viewer,
): ContributionView {
  if (!(CONTRIBUTION_KINDS as readonly string[]).includes(row.kind)) {
    throw new Error("Tipo de aporte desconhecido no banco.");
  }
  return {
    id: row.id,
    kind: row.kind as ContributionView["kind"],
    amount: fromDbNumeric(row.amount),
    date: dbDate(row.contribution_date),
    member: {
      id: row.member_id,
      displayName: memberDisplayName(
        row.member?.profiles?.display_name ?? null,
      ),
    },
    notes: row.notes,
    canDelete: canDeleteContribution(
      viewer.role,
      row.created_by,
      viewer.userId,
    ),
  };
}

/** Janela do ritmo (D9): `hoje − 89 .. hoje`. Uma chamada a `goal_summary` para todas as metas. */
async function summaryByGoal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  now: ISODate,
): Promise<Map<string, GoalSummaryRow>> {
  const rows = await rpcGoalSummary(
    supabase,
    addDays(now, -(PACE_WINDOW_DAYS - 1)),
    now,
  );
  return new Map(rows.map((r) => [r.goalId, r]));
}

export async function listGoals(
  filters: { situacao?: GoalFilter } = {},
): Promise<GoalView[]> {
  const membership = await requireMembership();
  const supabase = await createClient();
  const now = today();
  const { situacao } = goalFiltersSchema.parse({ situacao: filters.situacao });
  const [rows, summaries] = await Promise.all([
    selectGoals(supabase, STATUSES_BY_FILTER[situacao]),
    summaryByGoal(supabase, now),
  ]);
  return rows.map((r) => toGoalView(r, summaries.get(r.id), now, membership));
}

/** Metas `active` (para o planejamento). */
export async function listGoalOptions(): Promise<GoalView[]> {
  const membership = await requireMembership();
  const supabase = await createClient();
  const now = today();
  const [rows, summaries] = await Promise.all([
    selectGoals(supabase, ["active"]),
    summaryByGoal(supabase, now),
  ]);
  return rows.map((r) => toGoalView(r, summaries.get(r.id), now, membership));
}

export async function getGoal(
  id: string,
  opts: { page?: number } = {},
): Promise<GoalDetail | null> {
  const membership = await requireMembership();
  // Id que não é uuid não existe (evita o erro 22P02 do Postgres).
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const now = today();
  const requestedPage = opts.page ?? 1;
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;
  const row = await selectGoalById(supabase, id);
  if (!row) return null;
  const [summaries, contributions, members] = await Promise.all([
    summaryByGoal(supabase, now),
    selectContributionPage(supabase, id, page, CONTRIBUTIONS_PAGE_SIZE),
    selectActiveMembers(supabase),
  ]);
  const memberRefs: MemberRef[] = members.map((m) => ({
    id: m.id,
    displayName: memberDisplayName(m.profiles?.display_name ?? null),
  }));
  return {
    ...toGoalView(row, summaries.get(row.id), now, membership),
    contributions: {
      items: contributions.items.map((c) => toContributionView(c, membership)),
      total: contributions.total,
      page,
      pageCount: Math.max(
        1,
        Math.ceil(contributions.total / CONTRIBUTIONS_PAGE_SIZE),
      ),
    },
    members: memberRefs,
  };
}
