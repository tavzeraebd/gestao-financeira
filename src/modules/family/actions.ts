"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { serverEnv } from "@/lib/env/server";
import {
  acceptInviteSchema,
  createFamilySchema,
  createInviteSchema,
  revokeInviteSchema,
} from "@/modules/family/schemas";
import {
  rpcAcceptInvite,
  rpcCreateFamily,
  rpcCreateInvite,
  rpcRevokeInvite,
} from "@/modules/family/repository";
import { runAction, type ActionResult } from "@/server/action";

// Nenhuma action recebe family_id: a família é derivada no banco (ADR-0008).

export async function createFamily(
  input: z.input<typeof createFamilySchema>,
): Promise<ActionResult<never>> {
  return runAction({
    module: "family",
    operation: "createFamily",
    schema: createFamilySchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await rpcCreateFamily(supabase, data.name);
      revalidatePath("/", "layout");
      redirect("/inicio");
    },
  });
}

export async function createInvite(
  input: z.input<typeof createInviteSchema>,
): Promise<ActionResult<{ inviteUrl: string; expiresAt: string }>> {
  return runAction({
    module: "family",
    operation: "createInvite",
    schema: createInviteSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const invite = await rpcCreateInvite(supabase, data.role, data.email);
      revalidatePath("/familia");
      // O token só existe aqui e na resposta; nunca é logado.
      return {
        inviteUrl: `${serverEnv.APP_URL}/convite/${invite.token}`,
        expiresAt: invite.expiresAt,
      };
    },
  });
}

export async function revokeInvite(
  input: z.input<typeof revokeInviteSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "family",
    operation: "revokeInvite",
    schema: revokeInviteSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await rpcRevokeInvite(supabase, data.inviteId);
      revalidatePath("/familia");
      return null;
    },
  });
}

export async function acceptInvite(
  input: z.input<typeof acceptInviteSchema>,
): Promise<ActionResult<never>> {
  return runAction({
    module: "family",
    operation: "acceptInvite",
    schema: acceptInviteSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await rpcAcceptInvite(supabase, data.token);
      revalidatePath("/", "layout");
      redirect("/inicio");
    },
  });
}
