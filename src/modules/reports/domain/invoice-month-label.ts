import { formatMonthBR, type ISODate } from "@/lib/dates";

/**
 * Rótulo da fatura pelo mês do vencimento.
 * `long`: "Fatura de novembro"; `short`: "Fatura nov/26".
 */
export function invoiceMonthLabel(
  dueDate: ISODate,
  style: "long" | "short",
): string {
  if (style === "long") {
    // formatMonthBR("long") devolve "novembro de 2026".
    const month = formatMonthBR(dueDate, "long").split(" ")[0]!.toLowerCase();
    return `Fatura de ${month}`;
  }
  const month = formatMonthBR(dueDate, "short").replace(".", "").toLowerCase();
  return `Fatura ${month}/${dueDate.slice(2, 4)}`;
}
