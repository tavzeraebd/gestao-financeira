import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/modules/family/permissions";
import {
  listActiveMembers,
  listPendingInvites as selectPendingInvites,
  rpcGetInvitePreview,
} from "@/modules/family/repository";
import type {
  FamilyOverview,
  InvitePreview,
  InviteView,
} from "@/modules/family/types";
import { getOptionalUser, requireMembership } from "@/server/auth";
import { toAppError } from "@/server/errors";

export async function getFamilyOverview(): Promise<FamilyOverview> {
  const membership = await requireMembership();
  const supabase = await createClient();
  const members = await listActiveMembers(
    supabase,
    membership.familyId,
    membership.userId,
  );
  return {
    family: { id: membership.familyId, name: membership.familyName },
    myRole: membership.role,
    members,
  };
}

export async function listPendingInvites(): Promise<InviteView[]> {
  const membership = await requireMembership();
  if (!can(membership.role, "invite.list")) return [];
  const supabase = await createClient();
  return selectPendingInvites(supabase, membership.familyId);
}

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export async function getInvitePreview(
  token: string,
): Promise<
  | { ok: true; data: InvitePreview }
  | { ok: false; code: "INVITE_NOT_FOUND" | "UNAUTHENTICATED" }
> {
  const user = await getOptionalUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED" };
  if (!tokenSchema.safeParse(token).success) {
    return { ok: false, code: "INVITE_NOT_FOUND" };
  }
  const supabase = await createClient();
  try {
    return { ok: true, data: await rpcGetInvitePreview(supabase, token) };
  } catch (e) {
    const code = toAppError(e).code;
    if (code === "INVITE_NOT_FOUND") return { ok: false, code };
    if (code === "UNAUTHENTICATED") return { ok: false, code };
    throw e;
  }
}
