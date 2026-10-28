import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";

/**
 * IP do cliente calculado pelo proxy (`x-client-ip`, que sobrescreve o valor do cliente).
 * Fora de requisição, ou sem IP confiável, devolve `null`.
 */
export async function getClientIp(): Promise<string | null> {
  try {
    const value = (await headers()).get("x-client-ip");
    // Defesa em profundidade: só um IPv4/IPv6 válido vira chave de balde ou campo de log.
    return value &&
      value.length <= 45 &&
      !value.includes("%") &&
      isIP(value) !== 0
      ? value
      : null;
  } catch {
    // fora do escopo de uma requisição (ex.: testes)
    return null;
  }
}
