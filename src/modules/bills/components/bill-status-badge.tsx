import {
  AlertTriangleIcon,
  BanIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateBR, type ISODate } from "@/lib/dates";
import {
  BILL_STATUS_LABELS,
  type BillKind,
  type BillStatus,
} from "@/modules/bills/constants";

const STATUS_VISUAL: Record<
  BillStatus,
  {
    variant: "secondary" | "warning" | "danger" | "success" | "outline";
    icon: LucideIcon;
  }
> = {
  pending: { variant: "secondary", icon: ClockIcon },
  due_today: { variant: "warning", icon: CalendarClockIcon },
  overdue: { variant: "danger", icon: AlertTriangleIcon },
  paid: { variant: "success", icon: CheckCircle2Icon },
  canceled: { variant: "outline", icon: BanIcon },
};

/** Estado do compromisso: ícone + texto + cor (nunca só cor). O `status` já vem derivado do servidor. */
export function BillStatusBadge({
  status,
  kind,
}: {
  status: BillStatus;
  kind: BillKind;
}) {
  const { variant, icon: Icon } = STATUS_VISUAL[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {BILL_STATUS_LABELS[status][kind]}
    </Badge>
  );
}

/** Texto de apoio do vencimento, a partir do `days` calculado no servidor. */
export function billDueText(bill: {
  status: BillStatus;
  kind: BillKind;
  days: number;
  paidOn: ISODate | null;
}): string | null {
  switch (bill.status) {
    case "due_today":
      return "vence hoje";
    case "overdue": {
      const ago = Math.abs(bill.days);
      return ago === 1 ? "venceu ontem" : `venceu há ${ago} dias`;
    }
    case "pending":
      return bill.days === 1 ? "vence amanhã" : `vence em ${bill.days} dias`;
    case "paid":
      return bill.paidOn
        ? `${bill.kind === "pagar" ? "pago" : "recebido"} em ${formatDateBR(bill.paidOn)}`
        : null;
    default:
      return null;
  }
}
