import { CalendarClockIcon } from "lucide-react";
import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import { BillStatusBadge } from "@/modules/bills/components/bill-status-badge";
import { UPCOMING_LIMIT } from "@/modules/bills/constants";
import type { BillListItem } from "@/modules/bills/types";

/** Até 5 compromissos `pending` com vencimento até o fim do mês corrente (inclui vencidos). */
export function UpcomingBillsCard({ items }: { items: BillListItem[] }) {
  const shown = items.slice(0, UPCOMING_LIMIT);
  return (
    <Card className="h-full" data-testid="proximos-vencimentos">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Próximos vencimentos</h2>
        {shown.length > 0 ? (
          <Link
            href="/compromissos"
            className="text-primary-text -my-2 inline-flex min-h-10 items-center text-sm underline"
          >
            Ver todos
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <EmptyState
            icon={CalendarClockIcon}
            title="Nenhum vencimento até o fim do mês"
            description="As contas em aberto com vencimento neste mês aparecem aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {shown.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/compromissos/${item.id}`}
                  className="focus-visible:ring-ring flex min-h-14 items-center gap-3 rounded-md py-2 outline-none hover:underline focus-visible:ring-3"
                >
                  <CategoryIcon
                    icon={item.category.icon}
                    color={item.category.color}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {item.description}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatDateBR(item.dueDate)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Money
                      cents={item.amount}
                      direction={item.kind === "pagar" ? "out" : "in"}
                      className="text-sm font-semibold"
                    />
                    <BillStatusBadge status={item.status} kind={item.kind} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
