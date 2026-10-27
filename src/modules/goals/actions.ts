"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  addContribution as addContributionService,
  changeGoalStatus as changeGoalStatusService,
  createGoal as createGoalService,
  deleteContribution as deleteContributionService,
  updateGoal as updateGoalService,
} from "@/modules/goals/service";
import {
  contributionIdSchema,
  contributionSchema,
  goalInputSchema,
  goalStatusSchema,
  updateGoalSchema,
} from "@/modules/goals/schemas";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateGoals(): void {
  revalidatePath("/metas", "layout");
  revalidatePath("/inicio");
}

export async function createGoal(
  input: z.input<typeof goalInputSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "goals",
    operation: "createGoal",
    schema: goalInputSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await createGoalService(supabase, membership, data);
      revalidateGoals();
      return { id };
    },
  });
}

export async function updateGoal(
  input: z.input<typeof updateGoalSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "goals",
    operation: "updateGoal",
    schema: updateGoalSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateGoalService(supabase, data);
      revalidateGoals();
      return null;
    },
  });
}

export async function changeGoalStatus(
  input: z.input<typeof goalStatusSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "goals",
    operation: "changeGoalStatus",
    schema: goalStatusSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await changeGoalStatusService(supabase, data);
      revalidateGoals();
      return null;
    },
  });
}

export async function addContribution(
  input: z.input<typeof contributionSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "goals",
    operation: "addContribution",
    schema: contributionSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await addContributionService(supabase, membership, data);
      revalidateGoals();
      return { id };
    },
  });
}

export async function deleteContribution(
  input: z.input<typeof contributionIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "goals",
    operation: "deleteContribution",
    schema: contributionIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await deleteContributionService(supabase, data.contributionId);
      revalidateGoals();
      return null;
    },
  });
}
