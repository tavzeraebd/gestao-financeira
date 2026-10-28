import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/server/errors";
import type { Database } from "@/types/database";
import type { FamilyRole } from "@/modules/family/permissions";
import type {
  InvitePreview,
  InviteView,
  MemberView,
  Membership,
} from "@/modules/family/types";

type Client = SupabaseClient<Database>;

const ROLES: readonly string[] = ["owner", "admin", "member"];

function toRole(value: string): FamilyRole {
  if (!ROLES.includes(value)) throw new Error("Papel desconhecido no banco.");
  return value as FamilyRole;
}

function toInviteRole(value: string): "admin" | "member" {
  if (value !== "admin" && value !== "member") {
    throw new Error("Papel de convite desconhecido no banco.");
  }
  return value;
}

/** Vínculo ativo do usuário (RLS já restringe às próprias famílias). */
export async function findActiveMembership(
  supabase: Client,
  userId: string,
): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, family_id, role, families(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.families) return null;
  return {
    userId,
    memberId: data.id,
    familyId: data.family_id,
    familyName: data.families.name,
    role: toRole(data.role),
  };
}

export async function listActiveMembers(
  supabase: Client,
  familyId: string,
  currentUserId: string,
): Promise<Omit<MemberView, "actions">[]> {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, user_id, role, joined_at, profiles(display_name, avatar_url)")
    .eq("family_id", familyId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data.map((m) => ({
    memberId: m.id,
    userId: m.user_id,
    displayName: m.profiles?.display_name ?? "Integrante",
    avatarUrl: m.profiles?.avatar_url ?? null,
    role: toRole(m.role),
    joinedAt: m.joined_at,
    isMe: m.user_id === currentUserId,
  }));
}

/** Colunas explícitas: `select *` falha (token_hash fora do grant). */
export async function listPendingInvites(
  supabase: Client,
  familyId: string,
): Promise<InviteView[]> {
  const { data, error } = await supabase
    .from("family_invites")
    .select("id, role, invited_email, expires_at, created_at")
    .eq("family_id", familyId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((i) => ({
    id: i.id,
    role: toInviteRole(i.role),
    invitedEmail: i.invited_email,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }));
}

export async function rpcCreateFamily(
  supabase: Client,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_family", { p_name: name });
  if (error) throw error;
  return data;
}

export async function rpcCreateInvite(
  supabase: Client,
  role: "admin" | "member",
  email: string | undefined,
): Promise<{ inviteId: string; token: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc("create_family_invite", {
    p_role: role,
    p_email: email,
  });
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error("create_family_invite não retornou linha.");
  return {
    inviteId: row.invite_id,
    token: row.token,
    expiresAt: row.expires_at,
  };
}

export async function rpcRevokeInvite(
  supabase: Client,
  inviteId: string,
): Promise<void> {
  const { error } = await supabase.rpc("revoke_family_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
}

export async function rpcAcceptInvite(
  supabase: Client,
  token: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("accept_family_invite", {
    p_token: token,
  });
  if (error) throw error;
  return data;
}

export async function rpcGetInvitePreview(
  supabase: Client,
  token: string,
): Promise<InvitePreview> {
  const { data, error } = await supabase.rpc("get_invite_preview", {
    p_token: token,
  });
  if (error) throw error;
  const row = data[0];
  if (!row) {
    throw new AppError("INVITE_NOT_FOUND");
  }
  const status = row.status;
  if (
    status !== "pending" &&
    status !== "expired" &&
    status !== "accepted" &&
    status !== "revoked"
  ) {
    throw new Error("Status de convite desconhecido no banco.");
  }
  return {
    familyName: row.family_name,
    role: toInviteRole(row.role),
    expiresAt: row.expires_at,
    status,
    emailBound: row.email_bound,
  };
}

export async function rpcChangeMemberRole(
  supabase: Client,
  memberId: string,
  role: "admin" | "member",
): Promise<void> {
  const { error } = await supabase.rpc("change_member_role", {
    p_member_id: memberId,
    p_role: role,
  });
  if (error) throw error;
}

export async function rpcTransferOwnership(
  supabase: Client,
  memberId: string,
): Promise<void> {
  const { error } = await supabase.rpc("transfer_ownership", {
    p_member_id: memberId,
  });
  if (error) throw error;
}

export async function rpcRemoveFamilyMember(
  supabase: Client,
  memberId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remove_family_member", {
    p_member_id: memberId,
  });
  if (error) throw error;
}

export async function rpcLeaveFamily(supabase: Client): Promise<void> {
  const { error } = await supabase.rpc("leave_family");
  if (error) throw error;
}

/** Devolve quantas linhas o update alcançou (0 = a RLS negou: só o owner renomeia). */
export async function updateFamilyName(
  supabase: Client,
  familyId: string,
  name: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("families")
    .update({ name })
    .eq("id", familyId)
    .select("id");
  if (error) throw error;
  return data.length;
}
