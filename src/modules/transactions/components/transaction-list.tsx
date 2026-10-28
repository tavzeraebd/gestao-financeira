import { ArrowRightIcon, RepeatIcon } from "lucide-react";
import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/dates";
import { TRANSACTION_TYPE_LABELS } from "@/modules/transactions/constants";
import type { TransactionListItem } from "@/modules/transactions/types";

function accountLabel(item: TransactionListItem) {
  if (item.destinationAccount) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {item.account.name}
        <ArrowRightIcon aria-label="para" className="size-3.5" />
        {item.destinationAccount.name}
      </span>
    );
  }
  return item.account.name;
}

function Leading({ item }: { item: TransactionListItem }) {
  return item.category ? (
    <CategoryIcon icon={item.category.icon} color={item.category.color} />
  ) : (
    <CategoryIcon icon="wallet" color="chart-6" />
  );
}

function Title({ item }: { item: TransactionListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium break-words">{item.description}</span>
      {item.reversalOfId ? <Badge variant="secondary">Estorno</Badge> : null}
      {item.recurrenceId ? (
        <Badge variant="outline">
          <RepeatIcon aria-hidden="true" />
          Recorrente
        </Badge>
      ) : null}
    </span>
  );
}

function Subtitle({ item }: { item: TransactionListItem }) {
  return (
    <span className="text-muted-foreground text-xs">
      {item.category?.name ?? TRANSACTION_TYPE_LABELS[item.type]}
      {" · "}
      {accountLabel(item)}
    </span>
  );
}

export function TransactionList({ items }: { items: TransactionListItem[] }) {
  return (
    <ResponsiveList
      items={items}
      getKey={(item) => item.id}
      caption="Lançamentos"
      columns={[
        {
          id: "data",
          header: "Data",
          className: "whitespace-nowrap tabular-nums",
          cell: (item) => formatDateBR(item.transactionDate),
        },
        {
          id: "descricao",
          header: "Descrição",
          cell: (item) => (
            <Link
              href={`/transacoes/${item.id}`}
              className="focus-visible:ring-ring -my-2 flex min-h-10 items-center gap-3 rounded-md py-2 outline-none hover:underline focus-visible:ring-3"
            >
              <Leading item={item} />
              <span className="flex min-w-0 flex-col">
                <Title item={item} />
                <Subtitle item={item} />
              </span>
            </Link>
          ),
        },
        {
          id: "responsavel",
          header: "Responsável",
          cell: (item) => (
            <span className="text-muted-foreground">
              {item.assignedMember?.displayName ?? "—"}
            </span>
          ),
        },
        {
          id: "valor",
          header: "Valor",
          align: "end",
          cell: (item) => (
            <Money
              cents={item.amount}
              direction={item.direction}
              className="font-medium"
            />
          ),
        },
      ]}
      renderCard={(item) => (
        <Link
          href={`/transacoes/${item.id}`}
          className="focus-visible:ring-ring -m-4 flex min-h-14 items-center gap-3 rounded-xl p-4 outline-none focus-visible:ring-3"
        >
          <Leading item={item} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Title item={item} />
            <Subtitle item={item} />
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatDateBR(item.transactionDate)}
              {item.assignedMember?.displayName
                ? ` · ${item.assignedMember.displayName}`
                : ""}
            </span>
          </span>
          <Money
            cents={item.amount}
            direction={item.direction}
            className="text-sm font-semibold"
          />
        </Link>
      )}
    />
  );
}
