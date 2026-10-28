import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type ProfileRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function findProfile(
  supabase: Client,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
  };
}

export type SecurityEventRow = {
  id: string;
  action: "password.changed";
  createdAt: string;
};

/** Os últimos eventos de segurança do próprio usuário (a RLS já restringe; o filtro por user_id usa o índice). */
export async function listOwnSecurityEvents(
  supabase: Client,
  userId: string,
  limit: number,
): Promise<SecurityEventRow[]> {
  const { data, error } = await supabase
    .from("security_events")
    .select("id, action, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  // O CHECK do banco só admite 'password.changed'; ação desconhecida é descartada em vez de exibida crua.
  return data.flatMap((row) =>
    row.action === "password.changed"
      ? [{ id: row.id, action: row.action, createdAt: row.created_at }]
      : [],
  );
}

/** Quantos OUTROS integrantes ativos a família tem (só a contagem; a RLS já limita às próprias famílias). */
export async function countOtherActiveMembers(
  supabase: Client,
  familyId: string,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("family_members")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId)
    .eq("status", "active")
    .neq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** `true` se o usuário tem identidade de e-mail e senha (exigida para reautenticar a exclusão). */
export function hasPasswordIdentity(
  identities: readonly { provider: string }[] | null | undefined,
): boolean {
  return (identities ?? []).some((i) => i.provider === "email");
}

/** Chama a RPC com a sessão do usuário (nunca service_role). Devolve se a família foi apagada junto. */
export async function rpcDeleteMyAccount(
  supabase: Client,
): Promise<{ familyErased: boolean }> {
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  const familyErased =
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    data.family_erased === true;
  return { familyErased };
}

/** Retorna false quando nenhuma linha foi alterada (ex.: RLS bloqueou). */
export async function updateOwnProfile(
  supabase: Client,
  userId: string,
  displayName: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("id");
  if (error) throw error;
  return data.length > 0;
}
