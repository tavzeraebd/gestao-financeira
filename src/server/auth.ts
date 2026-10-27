import "server-only";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { findActiveMembership } from "@/modules/family/repository";
import type { Membership } from "@/modules/family/types";

export type AuthUser = { id: string; email: string };

export type { Membership };

/** Valida a identidade no Auth server (`getUser()`); nunca a sessão local do cookie. */
export const getOptionalUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Falha de rede/servidor não pode virar "deslogado" silenciosamente.
    if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
      throw error;
    }
    return null;
  }
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}

export const getOptionalMembership = cache(
  async (): Promise<Membership | null> => {
    const user = await getOptionalUser();
    if (!user) return null;
    const supabase = await createClient();
    return findActiveMembership(supabase, user.id);
  },
);

export async function requireMembership(): Promise<Membership> {
  const user = await requireUser();
  const membership = await getOptionalMembership();
  if (!membership) redirect("/onboarding");
  return { ...membership, userId: user.id };
}
