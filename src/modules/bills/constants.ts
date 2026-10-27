import type { TransactionType } from "@/modules/transactions/constants";

/** Valores de `?tipo=` em /compromissos. */
export const BILL_KINDS = ["pagar", "receber"] as const;

export type BillKind = (typeof BILL_KINDS)[number];

export const BILL_KIND_LABELS: Record<BillKind, string> = {
  pagar: "A pagar",
  receber: "A receber",
};

/** `kind` da tela -> `type` do banco (compromisso é `expense`/`income` pendente). */
export const BILL_KIND_TO_TYPE = {
  pagar: "expense",
  receber: "income",
} as const satisfies Record<BillKind, TransactionType>;

export const BILL_SITUATIONS = [
  "abertos",
  "vencidos",
  "pagos",
  "cancelados",
] as const;

export type BillSituation = (typeof BILL_SITUATIONS)[number];

export const DEFAULT_BILL_SITUATION: BillSituation = "abertos";

export const BILL_SITUATION_LABELS: Record<BillSituation, string> = {
  abertos: "Em aberto",
  vencidos: "Vencidos",
  pagos: "Pagos",
  cancelados: "Cancelados",
};

/** Situação derivada de um compromisso (D6). `overdue` e `due_today` nunca são gravados. */
export const BILL_STATUSES = [
  "pending",
  "due_today",
  "overdue",
  "paid",
  "canceled",
] as const;

export type BillStatus = (typeof BILL_STATUSES)[number];

/** Rótulo por tipo: `paid` de "receber" é "Recebido". */
export const BILL_STATUS_LABELS: Record<
  BillStatus,
  Record<BillKind, string>
> = {
  pending: { pagar: "Pendente", receber: "Pendente" },
  due_today: { pagar: "Vence hoje", receber: "Vence hoje" },
  overdue: { pagar: "Vencido", receber: "Vencido" },
  paid: { pagar: "Pago", receber: "Recebido" },
  canceled: { pagar: "Cancelado", receber: "Cancelado" },
};

/** Janela de "Próximos vencimentos" em dias (D19). */
export const UPCOMING_DAYS = 30;

export const UPCOMING_LIMIT = 5;
