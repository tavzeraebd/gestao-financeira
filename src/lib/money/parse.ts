import { asCents, MAX_CENTS, type Cents } from "./cents";

export type MoneyError =
  | "EMPTY"
  | "INVALID_FORMAT"
  | "TOO_MANY_DECIMALS"
  | "NEGATIVE"
  | "OUT_OF_RANGE";

export type MoneyResult =
  { ok: true; value: Cents } | { ok: false; error: MoneyError };

// Com milhar (grupos de exatamente 3 dígitos) ou sem milhar; a vírgula é o único separador decimal.
const BRL_PATTERN = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;
const WHITESPACE = /[\s  ]/g;
const MAX_INTEGER_DIGITS = String(Math.floor(MAX_CENTS / 100)).length;

/**
 * Lê um valor digitado em pt-BR ("1.234,56", "R$ 12,5") como centavos, sem arredondar em silêncio.
 * Sem `allowNegative`, qualquer sinal `-` é `NEGATIVE`; com ele, aceita um `-` inicial.
 */
export function parseBRL(
  input: string,
  opts?: { allowNegative?: boolean },
): MoneyResult {
  let text = input.replace(WHITESPACE, "");
  let negative = false;

  const takeSign = (): boolean => {
    if (!text.startsWith("-")) return true;
    if (!opts?.allowNegative) return false;
    if (negative) return true; // dois sinais: o padrão abaixo rejeita
    negative = true;
    text = text.slice(1);
    return true;
  };

  if (text === "") return { ok: false, error: "EMPTY" };
  if (!takeSign()) return { ok: false, error: "NEGATIVE" };
  if (text.startsWith("R$")) text = text.slice(2);
  if (!takeSign()) return { ok: false, error: "NEGATIVE" };
  if (text === "") return { ok: false, error: "EMPTY" };

  const match = BRL_PATTERN.exec(text);
  if (!match) return { ok: false, error: "INVALID_FORMAT" };

  const integerDigits = (match[1] ?? "")
    .replace(/\./g, "")
    .replace(/^0+(?=\d)/, "");
  const decimals = match[2] ?? "";
  if (decimals.length > 2) return { ok: false, error: "TOO_MANY_DECIMALS" };
  if (integerDigits.length > MAX_INTEGER_DIGITS) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }

  const cents =
    parseInt(integerDigits, 10) * 100 + parseInt(decimals.padEnd(2, "0"), 10);
  if (cents > MAX_CENTS) return { ok: false, error: "OUT_OF_RANGE" };
  return { ok: true, value: asCents(negative ? -cents : cents) };
}
