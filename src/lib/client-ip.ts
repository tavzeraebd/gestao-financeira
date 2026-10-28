import { BlockList, isIP } from "node:net";

const MAX_IP_LENGTH = 45;

/**
 * Endereços que nunca identificam um cliente da internet. Sem proxy à frente, o Next preenche
 * `x-forwarded-for` com o endereço do socket (ex.: `::1`): aceitá-lo faria todas as requisições
 * compartilharem UMA chave nos baldes por IP e travaria todos (ADR-0034 §6). `BlockList` também
 * casa a forma IPv4 mapeada em IPv6 (`::ffff:127.0.0.1`) e as grafias expandidas.
 */
const NOT_A_CLIENT = new BlockList();
NOT_A_CLIENT.addSubnet("127.0.0.0", 8, "ipv4");
NOT_A_CLIENT.addAddress("0.0.0.0", "ipv4");
NOT_A_CLIENT.addAddress("::1", "ipv6");
NOT_A_CLIENT.addAddress("::", "ipv6");

/**
 * IP do cliente a partir de `x-forwarded-for`, contando `hops` proxies confiáveis a partir da
 * DIREITA (cada proxy confiável acrescenta o endereço de quem o contactou ao fim da lista).
 * Nunca lê a entrada mais à esquerda: ela é controlada pelo cliente (ADR-0034 §6).
 *
 * `hops` inteiro >= 1; `0` desativa (sem proxy confiável, não há IP confiável). Qualquer
 * falha (cabeçalho ausente, lista curta demais, valor que não é IPv4/IPv6, loopback ou
 * endereço não especificado) devolve `null`.
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
  const family = isIP(candidate) === 4 ? "ipv4" : "ipv6";
  return NOT_A_CLIENT.check(candidate, family) ? null : candidate;
}
