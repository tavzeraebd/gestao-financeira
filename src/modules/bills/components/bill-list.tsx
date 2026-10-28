import { RepeatIcon } from "lucide-react";
import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { formatDateBR, type ISODate } from "@/lib/dates";
import { BillActions } from "@/modules/bills/components/bill-actions";
import {
  BillStatusBadge,
  billDueText,
} from "@/modules/bills/components/bill-status-badge";
import type { BillListItem } from "@/modules/bills/types";

type BillListProps = {
  items: BillListItem[];
  accounts: { id: string; name: string }[];
  today: ISODate;
};

function hrefOf(item: BillListItem): string {
  return item.status === "paid"
    ? `/transacoes/${item.id}`
    : `/compromissos/${item.id}`;
}

function RecurringBadge() {
  return (
    <Badge variant="outline">
      <RepeatIcon aria-hidden="true" />
      Recorrente
    </Badge>
  );
}

function Title({ item }: { item: BillListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium break-words">{item.description}</span>
      {item.recurrence ? <RecurringBadge /> : null}
    </span>
  );
}

function Subtitle({ item }: { item: BillListItem }) {
  return (
    <span className="text-muted-foreground text-xs">
      {item.category.name} · {item.account.name}
    </span>
  );
}

function amountDirection(item: BillListItem) {
  return item.kind === "pagar" ? "out" : "in";
}

export function BillList({ items, accounts, today }: BillListProps) {
  return (
    <ResponsiveList
      items={items}
      getKey={(item) => item.id}
      caption="Contas a pagar e receber"
      columns={[
        {
          id: "vencimento",
          header: "Vencimento",
          className: "whitespace-nowrap",
          cell: (item) => (
            <span className="flex flex-col">
              <span className="tabular-nums">{formatDateBR(item.dueDate)}</span>
              <span className="text-muted-foreground text-xs">
                {billDueText(item)}
              </span>
            </span>
          ),
        },
        {
          id: "descricao",
          header: "Descrição",
          cell: (item) => (
            <Link
              href={hrefOf(item)}
              className="focus-visible:ring-ring -my-2 flex min-h-10 items-center gap-3 rounded-md py-2 outline-none hover:underline focus-visible:ring-3"
            >
              <CategoryIcon
                icon={item.category.icon}
                color={item.category.color}
              />
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
              direction={amountDirection(item)}
              className="font-medium"
            />
          ),
        },
        {
          id: "status",
          header: "Situação",
          cell: (item) => (
            <BillStatusBadge status={item.status} kind={item.kind} />
          ),
        },
        {
          id: "acoes",
          header: "Ações",
          cell: (item) => (
            <span className="flex flex-wrap gap-2">
              <BillActions bill={item} accounts={accounts} today={today} />
            </span>
          ),
        },
      ]}
      renderCard={(item) => (
        <div className="flex flex-col gap-3">
          <Link
            href={hrefOf(item)}
            className="focus-visible:ring-ring -m-4 flex min-h-14 items-center gap-3 rounded-xl p-4 outline-none focus-visible:ring-3"
          >
            <CategoryIcon
              icon={item.category.icon}
              color={item.category.color}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Title item={item} />
              <Subtitle item={item} />
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatDateBR(item.dueDate)} · {billDueText(item)}
                {item.assignedMember?.displayName
                  ? ` · ${item.assignedMember.displayName}`
                  : ""}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <Money
                cents={item.amount}
                direction={amountDirection(item)}
                className="text-sm font-semibold"
              />
              <BillStatusBadge status={item.status} kind={item.kind} />
            </span>
          </Link>
          <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
            <BillActions bill={item} accounts={accounts} today={today} />
          </div>
        </div>
      )}
    />
  );
}
