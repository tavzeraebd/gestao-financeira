import type { ActionError } from "@/server/action";

export const MEMBER_NOT_FOUND_MESSAGE =
  "Este integrante não faz mais parte da família. Atualize a página.";

/**
 * Mensagem por contexto: nas ações sobre integrante, `NOT_FOUND` (inexistente, de outra família ou já
 * encerrado, sem distinção) fala do integrante, não de um recurso genérico.
 */
export function memberErrorMessage(error: ActionError): string {
  return error.code === "NOT_FOUND" ? MEMBER_NOT_FOUND_MESSAGE : error.message;
}
