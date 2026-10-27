import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Membership } from "@/modules/family/types";
import {
  insertContribution,
  insertGoal,
  selectContributionExists,
  selectContributionIdByIdempotencyKey,
  selectGoalById,
  selectGoalIdByIdempotencyKey,
  setGoalStatusRow,
  softDeleteContribution,
  updateGoalRow,
  type GoalWrite,
} from "@/modules/goals/repository";
import type {
  contributionSchema,
  goalInputSchema,
  goalStatusSchema,
  updateGoalSchema,
} from "@/modules/goals/schemas";
import { AppError, isConstraintViolation } from "@/server/errors";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const GOAL_KEY = "goals_family_idempotency_key";
const CONTRIBUTION_KEY = "goal_contributions_family_idempotency_key";

function toWrite(
  data: z.output<typeof goalInputSchema> | z.output<typeof updateGoalSchema>,
): GoalWrite {
  return {
    name: data.name,
    description: data.description ?? null,
    targetAmount: data.targetAmount,
    targetDate: data.targetDate ?? null,
    icon: data.icon,
  };
}

/** Repetir a chave devolve o `id` já existente (`23505` na constraint de chave), sem erro. */
export async function createGoal(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof goalInputSchema>,
): Promise<string> {
  try {
    return await insertGoal(supabase, {
      ...toWrite(data),
      familyId: membership.familyId,
      idempotencyKey: data.idempotencyKey,
    });
  } catch (e) {
    if (isConstraintViolation(e, "23505", GOAL_KEY)) {
      const existing = await selectGoalIdByIdempotencyKey(
        supabase,
        membership.familyId,
        data.idempotencyKey,
      );
      if (existing) return existing;
    }
    throw e;
  }
}

export async function updateGoal(
  supabase: Client,
  data: z.output<typeof updateGoalSchema>,
): Promise<void> {
  if (!(await selectGoalById(supabase, data.goalId))) {
    throw new AppError("NOT_FOUND");
  }
  const updated = await updateGoalRow(supabase, data.goalId, toWrite(data));
  // A meta é visível, mas o update não alcançou nenhuma linha: a RLS negou (member).
  if (updated === 0) throw new AppError("FORBIDDEN");
}

/** Idempotente: repetir o estado atual é sucesso. As transições válidas são do trigger. */
export async function changeGoalStatus(
  supabase: Client,
  data: z.output<typeof goalStatusSchema>,
): Promise<void> {
  const current = await selectGoalById(supabase, data.goalId);
  if (!current) throw new AppError("NOT_FOUND");
  if (current.status === data.to) return;
  const updated = await setGoalStatusRow(supabase, data.goalId, data.to);
  if (updated === 0) throw new AppError("FORBIDDEN");
}

export async function addContribution(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof contributionSchema>,
): Promise<string> {
  if (!(await selectGoalById(supabase, data.goalId))) {
    throw new AppError("NOT_FOUND");
  }
  try {
    return await insertContribution(supabase, {
      familyId: membership.familyId,
      goalId: data.goalId,
      // Omitido = o próprio vínculo; quem pode lançar por outro é decidido pelo trigger.
      memberId: data.memberId ?? membership.memberId,
      kind: data.kind,
      amount: data.amount,
      contributionDate: data.contributionDate,
      notes: data.notes ?? null,
      idempotencyKey: data.idempotencyKey,
    });
  } catch (e) {
    if (isConstraintViolation(e, "23505", CONTRIBUTION_KEY)) {
      const existing = await selectContributionIdByIdempotencyKey(
        supabase,
        membership.familyId,
        data.idempotencyKey,
      );
      if (existing) return existing;
    }
    throw e;
  }
}

export async function deleteContribution(
  supabase: Client,
  contributionId: string,
): Promise<void> {
  if (!(await selectContributionExists(supabase, contributionId))) {
    throw new AppError("NOT_FOUND");
  }
  const updated = await softDeleteContribution(supabase, contributionId);
  // Visível, mas o update não alcançou nenhuma linha: a RLS negou (não é autor/owner/admin).
  if (updated === 0) throw new AppError("FORBIDDEN");
}
