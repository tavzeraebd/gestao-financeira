"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  budgetIdSchema,
  budgetInputSchema,
  updateBudgetSchema,
} from "@/modules/budgets/schemas";
import {
  createBudget as createBudgetService,
  setArchived,
  updateBudget as updateBudgetService,
} from "@/modules/budgets/service";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateBudgets(): void {
  revalidatePath("/orcamentos", "layout");
}

export async function createBudget(
  input: z.input<typeof budgetInputSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "budgets",
    operation: "createBudget",
    schema: budgetInputSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await createBudgetService(supabase, membership, data);
      revalidateBudgets();
      return { id };
    },
  });
}

export async function updateBudget(
  input: z.input<typeof updateBudgetSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "budgets",
    operation: "updateBudget",
    schema: updateBudgetSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateBudgetService(supabase, data);
      revalidateBudgets();
      return null;
    },
  });
}

export async function archiveBudget(
  input: z.input<typeof budgetIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "budgets",
    operation: "archiveBudget",
    schema: budgetIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setArchived(supabase, data.budgetId, true);
      revalidateBudgets();
      return null;
    },
  });
}

export async function unarchiveBudget(
  input: z.input<typeof budgetIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "budgets",
    operation: "unarchiveBudget",
    schema: budgetIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setArchived(supabase, data.budgetId, false);
      revalidateBudgets();
      return null;
    },
  });
}
