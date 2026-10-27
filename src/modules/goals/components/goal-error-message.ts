import type { ActionError } from "@/server/action";

/**
 * Mensagem por contexto: o texto padrão de `INVALID_STATUS_TRANSITION` fala de
 * compromisso, que não faz sentido em metas.
 */
export function goalErrorMessage(error: ActionError): string {
  if (error.code === "INVALID_STATUS_TRANSITION") {
    return "A situação desta meta mudou e a ação não vale mais. Atualize a página para ver a situação atual.";
  }
  return error.message;
}
