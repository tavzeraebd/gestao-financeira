"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  accountIdSchema,
  createAccountSchema,
  updateAccountSchema,
} from "@/modules/accounts/schemas";
import {
  createAccount as createAccountService,
  setActive,
  updateAccount as updateAccountService,
} from "@/modules/accounts/service";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateAccounts(): void {
  revalidatePath("/contas", "layout");
  revalidatePath("/transacoes", "layout");
  revalidatePath("/inicio");
}

export async function createAccount(
  input: z.input<typeof createAccountSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "accounts",
    operation: "createAccount",
    schema: createAccountSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await createAccountService(supabase, membership, data);
      revalidateAccounts();
      return { id };
    },
  });
}

export async function updateAccount(
  input: z.input<typeof updateAccountSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "accounts",
    operation: "updateAccount",
    schema: updateAccountSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateAccountService(supabase, data);
      revalidateAccounts();
      return null;
    },
  });
}

export async function archiveAccount(
  input: z.input<typeof accountIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "accounts",
    operation: "archiveAccount",
    schema: accountIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setActive(supabase, data.accountId, false);
      revalidateAccounts();
      return null;
    },
  });
}

export async function reactivateAccount(
  input: z.input<typeof accountIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "accounts",
    operation: "reactivateAccount",
    schema: accountIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await setActive(supabase, data.accountId, true);
      revalidateAccounts();
      return null;
    },
  });
}
