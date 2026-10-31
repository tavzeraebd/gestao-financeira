import { asCents, MAX_CENTS } from "./cents";
import { toBRLInput } from "./format";

/** Dígitos do teto de valor (99.999.999,99 = 10 dígitos). */
const MAX_DIGITS = String(MAX_CENTS).length;

/**
 * Máscara de centavos do campo de dinheiro: só os dígitos contam e são lidos como centavos
 * ("3480" -> "34,80", "1.234,56" -> "1.234,56"). Zeros à esquerda caem; dígitos além do teto
 * (`MAX_CENTS`) são ignorados; sem nenhum dígito o resultado é "". Com `allowNegative`, um número
 * ímpar de "-" (em qualquer posição) deixa o valor negativo e um segundo "-" volta a positivo; sem
 * a opção, o "-" é ignorado. Só "-" (sem dígitos) é mantido para a pessoa seguir digitando.
 * `deleting` (entrada de apagar) esvazia o campo quando só sobram zeros.
 */
export function maskBRLInput(
  raw: string,
  opts?: { allowNegative?: boolean; deleting?: boolean },
): string {
  const negative =
    opts?.allowNegative === true && (raw.match(/-/g)?.length ?? 0) % 2 === 1;
  const sign = negative ? "-" : "";
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);

  // Ao apagar, "0,0" (o que sobra de "0,03") esvazia o campo; digitar/colar zero dá "0,00".
  if (digits === "") {
    return /\d/.test(raw) && opts?.deleting !== true ? `${sign}0,00` : sign;
  }
  return sign + toBRLInput(asCents(parseInt(digits, 10)));
}
