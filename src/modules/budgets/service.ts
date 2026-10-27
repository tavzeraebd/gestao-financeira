import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  insertBudget,
  selectBudgetById,
  setBudgetArchivedAt,
  updateBudgetRow,
} from "@/modules/budgets/repository";
import type {
  budgetInputSchema,
  updateBudgetSchema,
} from "@/modules/budgets/schemas";
import type { Membership } from "@/modules/family/types";
import { AppError, isConstraintViolation } from "@/server/errors";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const ACTIVE_KEY = "budgets_family_category_active_key";

function translate(e: unknown): unknown {
  return isConstraintViolation(e, "23505", ACTIVE_KEY)
    ? new AppError("BUDGET_ALREADY_EXISTS", { cause: e })
    : e;
}

export async function createBudget(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof budgetInputSchema>,
): Promise<string> {
  try {
    return await insertBudget(supabase, {
      familyId: membership.familyId,
      categoryId: data.categoryId,
      amountLimit: data.amountLimit,
      startMonth: data.startMonth,
      endMonth: data.endMonth ?? null,
    });
  } catch (e) {
    throw translate(e);
  }
}

export async function updateBudget(
  supabase: Client,
  data: z.output<typeof updateBudgetSchema>,
): Promise<void> {
  const current = await selectBudgetById(supabase, data.budgetId);
  if (!current) throw new AppError("NOT_FOUND");
  const endMonth = data.endMonth ?? null;
  if (endMonth !== null && endMonth < current.start_month) {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: {
        endMonth: ["O mês final deve ser igual ou posterior ao mês inicial."],
      },
    });
  }
  const updated = await updateBudgetRow(supabase, data.budgetId, {
    amountLimit: data.amountLimit,
    endMonth,
  });
  // O orçamento é visível, mas o update não alcançou nenhuma linha: a RLS negou (member).
  if (updated === 0) throw new AppError("FORBIDDEN");
}

/** Idempotente: repetir o mesmo estado é sucesso e preserva a data de arquivamento original. */
export async function setArchived(
  supabase: Client,
  budgetId: string,
  archived: boolean,
): Promise<void> {
  const current = await selectBudgetById(supabase, budgetId);
  if (!current) throw new AppError("NOT_FOUND");
  if ((current.archived_at !== null) === archived) return;
  let updated: number;
  try {
    updated = await setBudgetArchivedAt(
      supabase,
      budgetId,
      archived ? new Date().toISOString() : null,
    );
  } catch (e) {
    throw translate(e);
  }
  if (updated === 0) throw new AppError("FORBIDDEN");
}
