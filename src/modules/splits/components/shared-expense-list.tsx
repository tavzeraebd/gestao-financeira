import { CheckCircle2Icon, ClockIcon } from "lucide-react";
import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/dates";
import type { SharedExpenseItem } from "@/modules/splits/types";


function StatusBadge({ status }: { status: SharedExpenseItem["status"] }) {
  return status === "paid" ? (
    <Badge variant="success">
      <CheckCircle2Icon aria-hidden="true" />
      Pago
    </Badge>
  ) : (
    <Badge variant="secondary">
      <ClockIcon aria-hidden="true" />
      Pendente
    </Badge>
  );
}

function payerText(item: SharedExpenseItem): string {
  return item.payer ? `Responsável: ${item.payer.displayName}` : "Sem responsável";
}

function Title({ item }: { item: SharedExpenseItem }) {
  return (
    <span className="flex items-center gap-2">
      <CategoryIcon
        icon={item.category.icon}
        color={item.category.color}
        size="sm"
      />
      <Link
        href={`/divisao/${item.id}`}
        className="font-medium break-words underline-offset-4 hover:underline"
      >
        {item.description}
      </Link>
    </span>
  );
}

function MyShare({ item }: { item: SharedExpenseItem }) {
  return item.myShare === null ? (
    <span className="text-muted-foreground">Você não participa</span>
  ) : (
    <>
      Sua parte <Money cents={item.myShare} />
    </>
  );
}

export function SharedExpenseList({ items }: { items: SharedExpenseItem[] }) {
  return (
    <ResponsiveList
      items={items}
      getKey={(item) => item.id}
      caption="Despesas divididas"
      columns={[
        {
          id: "data",
          header: "Data",
          className: "whitespace-nowrap",
          cell: (item) => (
            <span className="tabular-nums">{formatDateBR(item.date)}</span>
          ),
        },
        {
          id: "descricao",
          header: "Despesa",
          cell: (item) => (
            <span className="flex flex-col gap-0.5">
              <Title item={item} />
              <span className="text-muted-foreground text-xs">
                {payerText(item)}
              </span>
            </span>
          ),
        },
        {
          id: "partes",
          header: "Divisão",
          cell: (item) => (
            <span className="flex flex-col text-sm">
              <span>Dividida entre {item.parts.length}</span>
              <span className="text-xs">
                <MyShare item={item} />
              </span>
            </span>
          ),
        },
        {
          id: "situacao",
          header: "Situação",
          cell: (item) => <StatusBadge status={item.status} />,
        },
        {
          id: "valor",
          header: "Valor",
          align: "end",
          cell: (item) => <Money cents={item.amount} direction="out" />,
        },
      ]}
      renderCard={(item) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <Title item={item} />
            <Money cents={item.amount} direction="out" className="font-semibold" />
          </div>
          <div className="text-muted-foreground text-xs">
            {formatDateBR(item.date)} · {payerText(item)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Dividida entre {item.parts.length} · <MyShare item={item} />
            </span>
            <StatusBadge status={item.status} />
          </div>
        </div>
      )}
    />
  );
}
