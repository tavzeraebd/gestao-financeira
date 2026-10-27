import { asAggregateCents, type Cents } from "./cents";

const DB_NUMERIC = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** `"1234.56"` -> `123456`. Aceita agregados até o inteiro seguro (SEC-18). Parse por string (nunca por ponto flutuante); lança em formato inválido. */
export function fromDbNumeric(s: string): Cents {
  const match = DB_NUMERIC.exec(s);
  if (!match) throw new RangeError("Formato numérico inválido.");
  const integerDigits = (match[2] ?? "").replace(/^0+(?=\d)/, "");
  // Aceita agregados (saldos, somas): só o que passa do inteiro seguro lança. 14 dígitos inteiros
  // (×100) ainda cabem em ponto flutuante sem perda; mais que isso estoura antes de qualquer conta.
  if (integerDigits.length > 14) {
    throw new RangeError("Valor em centavos fora da faixa permitida.");
  }
  const cents =
    parseInt(integerDigits, 10) * 100 +
    parseInt((match[3] ?? "").padEnd(2, "0") || "0", 10);
  return asAggregateCents(match[1] ? -cents : cents);
}

/** `123456` -> `"1234.56"`, `-5` -> `"-0.05"`. */
export function toDbNumeric(c: Cents): string {
  const abs = Math.abs(c);
  const integer = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  return `${c < 0 ? "-" : ""}${integer}.${decimals}`;
}
