import { formatDateBR, isISODate, today } from "@/lib/dates";
import { formatBRL, fromDbNumeric } from "@/lib/money";
import type { HistoryEntry, HistoryField } from "@/modules/transactions/types";

const FIELD_LABELS: Record<HistoryField, string> = {
  amount: "Valor",
  transactionDate: "Data",
  accountId: "Conta",
  destinationAccountId: "Conta de destino",
  categoryId: "Categoria",
};

const REFERENCE_FIELDS: readonly HistoryField[] = [
  "accountId",
  "destinationAccountId",
  "categoryId",
];

function formatValue(field: HistoryField, value: string | null): string {
  if (value === null || value === "") return "—";
  try {
    if (field === "amount") return formatBRL(fromDbNumeric(value));
    if (field === "transactionDate" && isISODate(value)) {
      return formatDateBR(value);
    }
  } catch {
    return value;
  }
  return value;
}

function describe(entry: HistoryEntry): string {
  if (entry.action === "transaction.deleted") return "Lançamento excluído";
  if (entry.action === "transaction.reversed") return "Estorno registrado";
  if (entry.action === "transaction.canceled") return "Compromisso cancelado";
  if (entry.action === "transaction.paid") {
    return entry.changes.length === 0
      ? "Compromisso pago"
      : `Compromisso pago (${describeChanges(entry)})`;
  }
  if (entry.changes.length === 0) return "Lançamento alterado";
  return describeChanges(entry);
}

function describeChanges(entry: HistoryEntry): string {
  return entry.changes
    .map((change) => {
      const label = FIELD_LABELS[change.field];
      if (REFERENCE_FIELDS.includes(change.field)) return `${label} alterada`;
      return `${label}: ${formatValue(change.field, change.old)} → ${formatValue(change.field, change.new)}`;
    })
    .join("; ");
}

/** Só para owner/admin (a RLS de auditoria já esconde dos demais). */
export function TransactionHistory({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhuma alteração registrada neste lançamento.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="py-2">
          {describe(entry)} · {entry.actorName ?? "Alguém da família"} ·{" "}
          {formatDateBR(today(new Date(entry.occurredAt)))}
        </li>
      ))}
    </ul>
  );
}
