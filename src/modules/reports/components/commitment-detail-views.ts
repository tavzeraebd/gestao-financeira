import type { ISODate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { CommitmentDetails } from "@/modules/reports/types";

/** O que o diálogo de detalhamento pode mostrar. */
export type DetailView =
  | { kind: "month"; month: ISODate }
  | { kind: "category"; key: string }
  | { kind: "accounts" }
  | { kind: "total" }
  | { kind: "lowest" };

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
        description: `Itens comprometidos na categoria, de ${details.label}.`,
      };
    }
    case "accounts":
      return {
        title: "Saldo atual",
        description: "Saldo de cada conta, só com o que já foi realizado.",
      };
    case "total":
      return {
        title: "Total comprometido",
        description: `${formatBRL(details.totalCommitted)} em ${details.label}, mês a mês.`,
      };
    case "lowest":
      return {
        title: "Menor saldo projetado",
        description:
          "Saldo atual mais a receita esperada, menos o comprometido, mês a mês.",
      };
  }
}
