"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env/server";
import {
  acceptInviteSchema,
  changeRoleSchema,
  createFamilySchema,
  createInviteSchema,
  memberIdSchema,
  renameFamilySchema,
  revokeInviteSchema,
} from "@/modules/family/schemas";
import {
  rpcAcceptInvite,
  rpcChangeMemberRole,
  rpcCreateFamily,
  rpcCreateInvite,
  rpcLeaveFamily,
  rpcRemoveFamilyMember,
  rpcRevokeInvite,
  rpcTransferOwnership,
  updateFamilyName,
} from "@/modules/family/repository";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";
import { AppError } from "@/server/errors";

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

export async function changeMemberRole(
  input: z.input<typeof changeRoleSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "family",
    operation: "changeMemberRole",
    schema: changeRoleSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await rpcChangeMemberRole(supabase, data.memberId, data.role);
      revalidatePath("/familia");
      return null;
    },
  });
}

export async function transferOwnership(
  input: z.input<typeof memberIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "family",
    operation: "transferOwnership",
    schema: memberIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await rpcTransferOwnership(supabase, data.memberId);
      revalidatePath("/familia");
      return null;
    },
  });
}

export async function removeMember(
  input: z.input<typeof memberIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "family",
    operation: "removeMember",
    schema: memberIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await rpcRemoveFamilyMember(supabase, data.memberId);
      revalidatePath("/familia");
      return null;
    },
  });
}

/** O cliente navega para `/onboarding` quando `ok`. */
export async function leaveFamily(): Promise<ActionResult<null>> {
  return runAction({
    module: "family",
    operation: "leaveFamily",
    schema: z.object({}),
    input: {},
    auth: "required",
    handler: async (_data, { supabase }) => {
      await rpcLeaveFamily(supabase);
      revalidatePath("/", "layout");
      return null;
    },
  });
}

export async function renameFamily(
  input: z.input<typeof renameFamilySchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "family",
    operation: "renameFamily",
    schema: renameFamilySchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const rows = await updateFamilyName(
        supabase,
        membership.familyId,
        data.name,
      );
      // 0 linhas = a RLS negou (não é o owner).
      if (rows === 0) throw new AppError("FORBIDDEN");
      revalidatePath("/", "layout");
      return null;
    },
  });
}
