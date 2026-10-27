"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ActionError, ActionResult } from "@/server/action";

/**
 * Sessão expirada: toda action que devolve `UNAUTHENTICATED` leva ao login
 * com o aviso e a rota atual em `next` (ADR-0017). Devolve `true` se tratou.
 */
export function useSessionExpiredRedirect(): (error: ActionError) => boolean {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (error) => {
      if (error.code !== "UNAUTHENTICATED") return false;
      router.replace(
        `/login?motivo=sessao_expirada&next=${encodeURIComponent(pathname)}`,
      );
      return true;
    },
    [router, pathname],
  );
}

/**
 * Mostra no campo os `fieldErrors` de um `VALIDATION_ERROR`. Devolve `false` se
 * nenhum campo exibido recebeu erro (ex.: erro em `next`), para que o
 * formulário mostre o erro geral em vez de silenciar.
 */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: ActionError,
  fields: readonly Path<T>[],
): boolean {
  if (error.code !== "VALIDATION_ERROR" || !error.fieldErrors) return false;
  let shown = false;
  for (const name of fields) {
    const message = error.fieldErrors[name]?.[0];
    if (message) {
      setError(name, { message });
      shown = true;
    }
  }
  return shown;
}

export const NETWORK_ERROR_MESSAGE =
  "Não foi possível falar com o servidor. Confira sua conexão e tente de novo; o que você digitou foi mantido.";

/** Falha de rede (fetch rejeitado) vira um erro geral em vez de exceção solta. */
export async function safeAction<T>(
  call: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: NETWORK_ERROR_MESSAGE,
        requestId: "",
      },
    };
  }
}

/**
 * Trata a falha de uma action em formulário: sessão expirada leva ao login; erro de
 * campo exibido vai ao campo; o resto (inclusive campo não exibido) vira erro geral.
 */
export function useFailureHandler<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  showGeneral: (message: string) => void,
): (error: ActionError) => void {
  const sessionExpired = useSessionExpiredRedirect();
  return useCallback(
    (error) => {
      if (sessionExpired(error)) return;
      if (applyFieldErrors(setError, error, fields)) return;
      showGeneral(error.message);
    },
    [sessionExpired, setError, fields, showGeneral],
  );
}
