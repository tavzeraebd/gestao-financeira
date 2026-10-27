"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  billFormSchema,
  billIdSchema,
  payBillSchema,
  updateBillSchema,
} from "@/modules/bills/schemas";
import {
  cancelBill as cancelBillService,
  createBill as createBillService,
  payBill as payBillService,
  updateBill as updateBillService,
} from "@/modules/bills/service";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateBills(): void {
  revalidatePath("/compromissos", "layout");
  revalidatePath("/recorrencias", "layout");
  revalidatePath("/transacoes", "layout");
  revalidatePath("/contas", "layout");
  revalidatePath("/inicio");
}

export async function createBill(
  input: z.input<typeof billFormSchema>,
): Promise<ActionResult<{ id: string; kind: "transaction" | "recurrence" }>> {
  return runAction({
    module: "bills",
    operation: "createBill",
    schema: billFormSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const result = await createBillService(supabase, membership, data);
      revalidateBills();
      return result;
    },
  });
}

export async function updateBill(
  input: z.input<typeof updateBillSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "bills",
    operation: "updateBill",
    schema: updateBillSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateBillService(supabase, data);
      revalidateBills();
      return null;
    },
  });
}

export async function payBill(
  input: z.input<typeof payBillSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "bills",
    operation: "payBill",
    schema: payBillSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await payBillService(supabase, data);
      revalidateBills();
      return null;
    },
  });
}

export async function cancelBill(
  input: z.input<typeof billIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "bills",
    operation: "cancelBill",
    schema: billIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await cancelBillService(supabase, data.transactionId);
      revalidateBills();
      return null;
    },
  });
}
