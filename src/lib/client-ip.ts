import { isIP } from "node:net";

const MAX_IP_LENGTH = 45;

/**
 * IP do cliente a partir de `x-forwarded-for`, contando `hops` proxies confiáveis a partir da
 * DIREITA (cada proxy confiável acrescenta o endereço de quem o contactou ao fim da lista).
 * Nunca lê a entrada mais à esquerda: ela é controlada pelo cliente (ADR-0034 §6).
 *
 * `hops` inteiro >= 1; `0` desativa (sem proxy confiável, não há IP confiável). Qualquer
 * falha (cabeçalho ausente, lista curta demais, valor que não é IPv4/IPv6) devolve `null`.
 */
export function resolveClientIp(
  forwardedFor: string | null,
  hops: number,
): string | null {
  if (!forwardedFor || !Number.isInteger(hops) || hops < 1) return null;
  const entries = forwardedFor.split(",");
  const index = entries.length - hops;
  if (index < 0) return null;
  const candidate = entries[index]?.trim();
  if (
    !candidate ||
    candidate.length > MAX_IP_LENGTH ||
    // Escopo de IPv6 (`fe80::1%eth0`) não faz parte do endereço de internet.
    candidate.includes("%") ||
    isIP(candidate) === 0
  ) {
    return null;
  }
  return candidate;
}
