import { cn } from "@/lib/utils";
import { formatBRL, type Cents } from "@/lib/money";

type MoneyProps = {
  cents: Cents;
  /** `in` = entrada (+), `out` = saída (−), `neutral` = sem sinal. O sinal é texto, não só cor. */
  direction?: "in" | "out" | "neutral";
  className?: string;
};

export function Money({ cents, direction = "neutral", className }: MoneyProps) {
  const magnitude = Math.abs(cents) as Cents;
  const text =
    direction === "neutral" ? formatBRL(cents) : formatBRL(magnitude);
  const sign = direction === "in" ? "+" : direction === "out" ? "\u2212" : "";
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        direction === "in" && "text-income",
        direction === "out" && "text-expense",
        className,
      )}
    >
      {sign}
      {sign ? "\u00a0" : null}
      {text}
    </span>
  );
}
