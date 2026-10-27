import { z } from "zod";
import { parseBRL, type Cents, type MoneyError } from "@/lib/money";

export const POSITIVE_AMOUNT_MESSAGE = "Informe um valor maior que zero.";

const MESSAGES: Record<MoneyError, string> = {
  EMPTY: "Informe o valor.",
  INVALID_FORMAT: "Use vírgula para os centavos, como 1.234,56.",
  TOO_MANY_DECIMALS: "Use no máximo 2 casas decimais, como 12,50.",
  NEGATIVE: "O valor não pode ser negativo.",
  OUT_OF_RANGE: "O valor é muito alto. Informe até R$ 99.999.999,99.",
};

export type MoneyFieldOptions = { allowNegative?: boolean; positive?: boolean };

/**
 * Lê o texto digitado e devolve `Cents` ou a mensagem pt-BR do erro. Compartilhado por `brlAmount`
 * e pelos schemas cujo sinal depende de outro campo (saldo inicial de cartão).
 */
export function readBRL(
  input: string,
  opts: MoneyFieldOptions = {},
): { ok: true; value: Cents } | { ok: false; message: string } {
  const result = parseBRL(input, { allowNegative: opts.allowNegative });
  if (!result.ok) {
    // Com `positive`, "-5" e "0" dizem a mesma coisa: o valor precisa ser maior que zero.
    const message =
      opts.positive && result.error === "NEGATIVE"
        ? POSITIVE_AMOUNT_MESSAGE
        : MESSAGES[result.error];
    return { ok: false, message };
  }
  if (opts.positive && result.value <= 0) {
    return { ok: false, message: POSITIVE_AMOUNT_MESSAGE };
  }
  return result;
}

/** Campo monetário: recebe a string do formulário ("1.234,56") e produz `Cents`. */
export function brlAmount(opts: MoneyFieldOptions = {}) {
  return z.string({ error: MESSAGES.EMPTY }).transform((value, ctx): Cents => {
    const result = readBRL(value, opts);
    if (!result.ok) {
      ctx.issues.push({
        code: "custom",
        message: result.message,
        input: value,
      });
      return z.NEVER;
    }
    return result.value;
  });
}
