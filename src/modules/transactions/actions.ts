"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  createTransaction as createTransactionService,
  deleteTransaction as deleteTransactionService,
  reverseTransaction as reverseTransactionService,
  updateTransaction as updateTransactionService,
} from "@/modules/transactions/service";
import {
  reverseTransactionSchema,
  transactionIdSchema,
  transactionInputSchema,
  updateTransactionSchema,
} from "@/modules/transactions/schemas";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateTransactions(): void {
  revalidatePath("/transacoes", "layout");
  revalidatePath("/contas", "layout");
  revalidatePath("/inicio");
}

export async function createTransaction(
  input: z.input<typeof transactionInputSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "transactions",
    operation: "createTransaction",
    schema: transactionInputSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await createTransactionService(supabase, membership, data);
      revalidateTransactions();
      return { id };
    },
  });
}

export async function updateTransaction(
  input: z.input<typeof updateTransactionSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "transactions",
    operation: "updateTransaction",
    schema: updateTransactionSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateTransactionService(supabase, data);
      revalidateTransactions();
      return null;
    },
  });
}

export async function deleteTransaction(
  input: z.input<typeof transactionIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "transactions",
    operation: "deleteTransaction",
    schema: transactionIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await deleteTransactionService(supabase, data.transactionId);
      revalidateTransactions();
      return null;
    },
  });
}

export async function reverseTransaction(
  input: z.input<typeof reverseTransactionSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "transactions",
    operation: "reverseTransaction",
    schema: reverseTransactionSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await reverseTransactionService(supabase, membership, data);
      revalidateTransactions();
      return { id };
    },
  });
}
