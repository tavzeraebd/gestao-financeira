"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";
import {
  createSettlement as createSettlementService,
  deleteSettlement as deleteSettlementService,
  setTransactionSplits as setTransactionSplitsService,
} from "./service";
import {
  setSplitSchema,
  settlementIdSchema,
  settlementSchema,
} from "./schemas";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateSplits(): void {
  revalidatePath("/divisao", "layout");
  revalidatePath("/transacoes", "layout");
  revalidatePath("/compromissos", "layout");
  revalidatePath("/inicio");
}

export async function setTransactionSplits(
  input: z.input<typeof setSplitSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "splits",
    operation: "setTransactionSplits",
    schema: setSplitSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setTransactionSplitsService(supabase, data);
      revalidateSplits();
      return null;
    },
  });
}

export async function createSettlement(
  input: z.input<typeof settlementSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "splits",
    operation: "createSettlement",
    schema: settlementSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const result = await createSettlementService(supabase, membership, data);
      revalidateSplits();
      return result;
    },
  });
}

export async function deleteSettlement(
  input: z.input<typeof settlementIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "splits",
    operation: "deleteSettlement",
    schema: settlementIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await deleteSettlementService(supabase, data.settlementId);
      revalidateSplits();
      return null;
    },
  });
}
