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

/**
 * O proxy decide por `getClaims()` (JWT local), este guard por `getUser()` (Auth server). Se a sessão
 * foi revogada (ex.: "Sair" em outro aparelho) com o JWT ainda dentro do prazo, só este guard
 * percebe. O destino precisa dizer isso: sem `motivo`, o proxy devolveria /login a /inicio, e o
 * navegador entraria em laço (ERR_TOO_MANY_REDIRECTS) até o JWT expirar. `src/proxy.ts` honra
 * esse `motivo` e não redireciona o visitante para /inicio.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (user) return user;
  // Só a presença de sessão no cookie escolhe o destino (para o proxy não fechar o laço); o acesso
  // continua negado porque a decisão acima é do `getUser()`, nunca dos claims.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  redirect(data?.claims ? "/login?motivo=sessao_expirada" : "/login");
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
