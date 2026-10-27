import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateBR, type ISODate } from "@/lib/dates";
import type { TransactionListItem } from "@/modules/transactions/types";

import { IndicatorInfo } from "./indicator-info";

type RecentTransactionsCardProps = {
  items: TransactionListItem[];
  from: ISODate;
  to: ISODate;
  periodLabel: string;
};

export function RecentTransactionsCard({
  items,
  from,
  to,
  periodLabel,
}: RecentTransactionsCardProps) {
  return (
    <Card className="h-full" data-testid="ultimas-transacoes">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <h2 className="text-base font-semibold">Últimas transações</h2>
            <IndicatorInfo id="recentTransactions" />
          </div>
          {items.length > 0 ? (
            <Link
              href={`/transacoes?de=${from}&ate=${to}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Ver todas
            </Link>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">{periodLabel}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title={`Nenhum lançamento em ${periodLabel}`}
            description="Os lançamentos efetivados do período aparecem aqui."
            action={
              <Link href="/transacoes/nova" className={buttonVariants()}>
                Nova transação
              </Link>
            }
          />
        ) : (
          <ul aria-label="Últimas transações" className="flex flex-col">
            {items.map((item) => (
              <li key={item.id} className="border-b last:border-b-0">
                <Link
                  href={`/transacoes/${item.id}`}
                  className="focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 rounded-md py-2 outline-none hover:underline focus-visible:ring-3"
                >
                  {item.category ? (
                    <CategoryIcon
                      icon={item.category.icon}
                      color={item.category.color}
                    />
                  ) : (
                    <CategoryIcon icon="wallet" color="chart-6" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium break-words">
                      {item.description}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatDateBR(item.transactionDate)}
                      {" · "}
                      {item.category?.name ?? item.account.name}
                    </span>
                  </span>
                  <Money
                    cents={item.amount}
                    direction={item.direction}
                    className="text-sm font-semibold"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
