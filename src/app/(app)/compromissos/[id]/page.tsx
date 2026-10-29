import { ChevronLeftIcon, RepeatIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBR, today } from "@/lib/dates";
import { listAccountOptions } from "@/modules/accounts/queries";
import { BillActions } from "@/modules/bills/components/bill-actions";
import {
  BillStatusBadge,
  billDueText,
} from "@/modules/bills/components/bill-status-badge";
import { getBill } from "@/modules/bills/queries";
import { SplitSummary } from "@/modules/splits/components/split-summary";
import { getTransactionSplit } from "@/modules/splits/queries";
import { TransactionHistory } from "@/modules/transactions/components/transaction-history";

export const metadata: Metadata = { title: "Compromisso" };

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-muted-foreground text-sm sm:w-48 sm:shrink-0">
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bill = await getBill(id);
  if (!bill) notFound();
  if (bill.status === "paid") redirect(`/transacoes/${bill.id}`);

  const accounts = (await listAccountOptions())
    .filter((a) => a.isActive)
    .map((a) => ({ id: a.id, name: a.name }));
  const dueText = billDueText(bill);
  const split = await getTransactionSplit(bill.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        href="/compromissos"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Compromissos
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BillStatusBadge status={bill.status} kind={bill.kind} />
          {bill.recurrence ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <RepeatIcon aria-hidden="true" className="size-3.5" />
              Recorrente
            </span>
          ) : null}
        </div>
        <h1 className="text-xl font-bold break-words">{bill.description}</h1>
        <p className="text-3xl font-bold">
          <Money
            cents={bill.amount}
            direction={bill.kind === "pagar" ? "out" : "in"}
          />
        </p>
      </header>

      <div className="flex justify-end gap-2 empty:hidden">
        <BillActions bill={bill} accounts={accounts} today={today()} />
      </div>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <dl className="divide-y">
            <Row label="Valor previsto">
              <Money cents={bill.amount} />
            </Row>
            <Row label="Vencimento">
              {formatDateBR(bill.dueDate, "long")}
              {dueText ? (
                <span className="text-muted-foreground"> ({dueText})</span>
              ) : null}
            </Row>
            <Row label="Situação">
              <BillStatusBadge status={bill.status} kind={bill.kind} />
            </Row>
            <Row label="Categoria">
              <span className="inline-flex items-center gap-2">
                <CategoryIcon
                  icon={bill.category.icon}
                  color={bill.category.color}
                  size="sm"
                />
                {bill.category.name}
              </span>
            </Row>
            <Row label="Conta ou cartão">{bill.account.name}</Row>
            <Row label="Responsável">
              {bill.assignedMember?.displayName ?? "Sem responsável"}
            </Row>
            <Row label="Observações">
              {bill.notes ? (
                <span className="whitespace-pre-line">{bill.notes}</span>
              ) : (
                <span className="text-muted-foreground">Sem observações</span>
              )}
            </Row>
            <Row label="Registrado por">
              {bill.createdBy.displayName} em{" "}
              {formatDateBR(today(new Date(bill.createdAt)))}
            </Row>
            {bill.recurrence ? (
              <Row label="Série">
                <Link
                  href={`/compromissos?serie=${bill.recurrence.id}&situacao=abertos`}
                  className="text-primary-text underline"
                >
                  {bill.recurrence.label}
                </Link>
              </Row>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <SplitSummary detail={split} />

      {bill.history ? (
        <Card className="[--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle className="text-base">Histórico de alterações</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionHistory entries={bill.history} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
