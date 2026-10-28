import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  countOtherActiveMembers,
  findProfile,
  hasPasswordIdentity,
} from "@/modules/profile/repository";
import type { AccountDeletionPreview } from "@/modules/profile/types";
import { findActiveMembership } from "@/modules/family/repository";
import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";

export async function getMyProfile(): Promise<{
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await findProfile(supabase, user.id);
  if (!profile) throw new AppError("NOT_FOUND");
  return { ...profile, email: user.email };
}

/**
 * Prévia da exclusão (ADR-0038). Só o papel do próprio usuário e contagens: nenhum dado de outro
 * integrante. `canDelete` espelha as regras da RPC (owner com outros e conta sem senha bloqueiam).
 */
export async function getAccountDeletionPreview(): Promise<AccountDeletionPreview> {
  const user = await requireUser();
  const supabase = await createClient();
  const [membership, identities] = await Promise.all([
    findActiveMembership(supabase, user.id),
    supabase.auth.getUserIdentities(),
  ]);
  if (identities.error) throw identities.error;
  const hasPassword = hasPasswordIdentity(identities.data.identities);

  if (!membership) {
    return {
      role: null,
      otherActiveMembers: 0,
      willEraseFamily: false,
      canDelete: hasPassword,
      hasPassword,
    };
  }
  const otherActiveMembers = await countOtherActiveMembers(
    supabase,
    membership.familyId,
    user.id,
  );
  const isOwner = membership.role === "owner";
  return {
    role: membership.role,
    otherActiveMembers,
    willEraseFamily: isOwner && otherActiveMembers === 0,
    canDelete: hasPassword && !(isOwner && otherActiveMembers > 0),
    hasPassword,
  };
}
