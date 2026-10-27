import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  selectRecurrenceById,
  setRecurrenceActive,
  setRecurrenceEndDate,
  updateRecurrenceRow,
} from "@/modules/recurrences/repository";
import type {
  endRecurrenceSchema,
  updateRecurrenceSchema,
} from "@/modules/recurrences/schemas";
import { AppError } from "@/server/errors";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** `end_date >= start_date` (check do banco, `23514`) -> erro no campo, com o próximo passo. */
function translateEndDate(e: unknown): unknown {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    e.code === "23514"
  ) {
    return new AppError("VALIDATION_ERROR", {
      cause: e,
      fieldErrors: {
        endDate: ["O término deve ser igual ou posterior ao início da série."],
      },
    });
  }
  return e;
}

async function requireVisible(supabase: Client, id: string): Promise<void> {
  if (!(await selectRecurrenceById(supabase, id))) {
    throw new AppError("NOT_FOUND");
  }
}

export async function updateRecurrence(
  supabase: Client,
  data: z.output<typeof updateRecurrenceSchema>,
): Promise<void> {
  await requireVisible(supabase, data.recurrenceId);
  let updated: number;
  try {
    updated = await updateRecurrenceRow(supabase, data.recurrenceId, {
      description: data.description,
      amount: data.amount,
      accountId: data.accountId,
      categoryId: data.categoryId,
      assignedMemberId: data.assignedMemberId ?? null,
      endDate: data.endDate ?? null,
    });
  } catch (e) {
    throw translateEndDate(e);
  }
  // Visível, mas o update não alcançou linha: a RLS negou (member que não criou a série).
  if (updated === 0) throw new AppError("FORBIDDEN");
}

/** Idempotente: repetir o mesmo estado é sucesso. */
export async function setActive(
  supabase: Client,
  recurrenceId: string,
  isActive: boolean,
): Promise<void> {
  await requireVisible(supabase, recurrenceId);
  if ((await setRecurrenceActive(supabase, recurrenceId, isActive)) === 0) {
    throw new AppError("FORBIDDEN");
  }
}

export async function endRecurrence(
  supabase: Client,
  data: z.output<typeof endRecurrenceSchema>,
): Promise<void> {
  await requireVisible(supabase, data.recurrenceId);
  let updated: number;
  try {
    updated = await setRecurrenceEndDate(
      supabase,
      data.recurrenceId,
      data.endDate,
    );
  } catch (e) {
    throw translateEndDate(e);
  }
  if (updated === 0) throw new AppError("FORBIDDEN");
}
