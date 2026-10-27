import { type Cents } from "./cents";
import { toDbNumeric } from "./db";

type SignDisplay = "auto" | "always" | "exceptZero";

const formatters = new Map<SignDisplay, Intl.NumberFormat>();

function formatterFor(signDisplay: SignDisplay): Intl.NumberFormat {
  let formatter = formatters.get(signDisplay);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      signDisplay,
    });
    formatters.set(signDisplay, formatter);
  }
  return formatter;
}

/** `123456` -> `"R$ 1.234,56"` (o espaço do Intl é U+00A0). Só exibição. */
export function formatBRL(
  c: Cents,
  opts?: { signDisplay?: SignDisplay },
): string {
  return formatterFor(opts?.signDisplay ?? "auto").format(c / 100);
}

/** `123456` -> `"1.234,56"`; valor inicial de campo de edição (sem `R$`). */
export function toBRLInput(c: Cents): string {
  const db = toDbNumeric(c);
  const negative = db.startsWith("-");
  const [integer = "0", decimals = "00"] = (negative ? db.slice(1) : db).split(
    ".",
  );
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${decimals}`;
}
