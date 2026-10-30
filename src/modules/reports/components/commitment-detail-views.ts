import type { ISODate } from "@/lib/dates";
import type { CommitmentDetails } from "@/modules/reports/types";

/** O que o diálogo de detalhamento pode mostrar. */
export type DetailView =
  | { kind: "month"; month: ISODate }
  | { kind: "category"; key: string }
  | { kind: "accounts" };

/** Título e descrição do diálogo para a visão aberta. */
export function describeView(
  details: CommitmentDetails,
  view: DetailView,
): { title: string; description: string } {
  switch (view.kind) {
    case "month": {
      const month = details.months.find((m) => m.month === view.month);
      return {
        title: month?.longLabel ?? "Mês",
        description:
          "Por que o mês tem este valor: cada operação que entra na conta.",
      };
    }
    case "category": {
      const category = details.categories.find((c) => c.key === view.key);
      return {
        title: category?.name ?? "Categoria",
        description: `Itens comprometidos na categoria em ${details.months[0]?.longLabel ?? "este mês"}.`,
      };
    }
    case "accounts":
      return {
        title: "Saldo atual",
        description: "Saldo de cada conta, só com o que já foi realizado.",
      };
  }
}
