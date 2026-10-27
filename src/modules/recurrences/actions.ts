"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";
import {
  endRecurrenceSchema,
  recurrenceIdSchema,
  updateRecurrenceSchema,
} from "@/modules/recurrences/schemas";
import {
  endRecurrence as endRecurrenceService,
  setActive,
  updateRecurrence as updateRecurrenceService,
} from "@/modules/recurrences/service";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateRecurrences(): void {
  revalidatePath("/recorrencias", "layout");
  revalidatePath("/compromissos", "layout");
  revalidatePath("/transacoes", "layout");
  revalidatePath("/orcamentos", "layout");
  revalidatePath("/contas", "layout");
  revalidatePath("/inicio");
}

export async function updateRecurrence(
  input: z.input<typeof updateRecurrenceSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "recurrences",
    operation: "updateRecurrence",
    schema: updateRecurrenceSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateRecurrenceService(supabase, data);
      await ensureRecurrencesMaterialized();
      revalidateRecurrences();
      return null;
    },
  });
}

export async function pauseRecurrence(
  input: z.input<typeof recurrenceIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "recurrences",
    operation: "pauseRecurrence",
    schema: recurrenceIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setActive(supabase, data.recurrenceId, false);
      revalidateRecurrences();
      return null;
    },
  });
}

export async function resumeRecurrence(
  input: z.input<typeof recurrenceIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "recurrences",
    operation: "resumeRecurrence",
    schema: recurrenceIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setActive(supabase, data.recurrenceId, true);
      await ensureRecurrencesMaterialized();
      revalidateRecurrences();
      return null;
    },
  });
}

export async function endRecurrence(
  input: z.input<typeof endRecurrenceSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "recurrences",
    operation: "endRecurrence",
    schema: endRecurrenceSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await endRecurrenceService(supabase, data);
      await ensureRecurrencesMaterialized();
      revalidateRecurrences();
      return null;
    },
  });
}
