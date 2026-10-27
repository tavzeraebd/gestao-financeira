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
