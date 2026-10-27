import { ChevronLeftIcon, PencilIcon, RepeatIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBR, today } from "@/lib/dates";
import { DeleteTransactionButton } from "@/modules/transactions/components/delete-transaction-button";
import { ReverseTransactionDialog } from "@/modules/transactions/components/reverse-transaction-dialog";
import { TransactionHistory } from "@/modules/transactions/components/transaction-history";
import { TRANSACTION_TYPE_LABELS } from "@/modules/transactions/constants";
import { SplitSummary } from "@/modules/splits/components/split-summary";
import { getTransactionSplit } from "@/modules/splits/queries";
import { getTransaction } from "@/modules/transactions/queries";

export const metadata: Metadata = { title: "Lançamento" };

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

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getTransaction(id);
  if (!detail) notFound();
  if (detail.status !== "paid") redirect(`/compromissos/${detail.id}`);

  const showReversals = detail.canReverse || detail.reversals.length > 0;
  const split = await getTransactionSplit(detail.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        href="/transacoes"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Transações
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {TRANSACTION_TYPE_LABELS[detail.type]}
          </Badge>
          {detail.reversalOfId ? (
            <Badge variant="secondary">Estorno</Badge>
          ) : null}
          {detail.recurrence ? (
            <Badge variant="outline">
              <RepeatIcon aria-hidden="true" />
              Recorrente
            </Badge>
          ) : null}
        </div>
        <h1 className="text-xl font-bold break-words">{detail.description}</h1>
        <p className="text-3xl font-bold">
          <Money cents={detail.amount} direction={detail.direction} />
        </p>
      </header>

      {detail.canEdit || detail.canReverse || detail.canDelete ? (
        <div className="flex flex-wrap gap-2">
          {detail.canEdit ? (
            <Link
              href={`/transacoes/${detail.id}/editar`}
              className={buttonVariants({ variant: "outline" })}
            >
              <PencilIcon aria-hidden="true" data-icon="inline-start" />
              Editar
            </Link>
          ) : null}
          {detail.canReverse ? (
            <ReverseTransactionDialog
              transactionId={detail.id}
              reversibleAmount={detail.reversibleAmount}
              originalDate={detail.transactionDate}
              today={today()}
            />
          ) : null}
          {detail.canDelete ? (
            <DeleteTransactionButton transactionId={detail.id} />
          ) : null}
        </div>
      ) : null}

      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <dl className="divide-y">
            <Row label="Data">
              {formatDateBR(detail.transactionDate, "long")}
            </Row>
            {detail.dueDate ? (
              <Row label="Vencimento">{formatDateBR(detail.dueDate)}</Row>
            ) : null}
            {detail.destinationAccount ? (
              <>
                <Row label="Conta de origem">{detail.account.name}</Row>
                <Row label="Conta de destino">
                  {detail.destinationAccount.name}
                </Row>
              </>
            ) : (
              <Row label="Conta ou cartão">{detail.account.name}</Row>
            )}
            {detail.category ? (
              <Row label="Categoria">
                <span className="inline-flex items-center gap-2">
                  <CategoryIcon
                    icon={detail.category.icon}
                    color={detail.category.color}
                    size="sm"
                  />
                  {detail.category.name}
                </span>
              </Row>
            ) : null}
            <Row label="Responsável">
              {detail.assignedMember?.displayName ?? "Sem responsável"}
            </Row>
            <Row label="Observações">
              {detail.notes ? (
                <span className="whitespace-pre-line">{detail.notes}</span>
              ) : (
                <span className="text-muted-foreground">Sem observações</span>
              )}
            </Row>
            <Row label="Registrado por">
              {detail.createdBy.displayName} em{" "}
              {formatDateBR(today(new Date(detail.createdAt)))}
            </Row>
            {detail.recurrence ? (
              <Row label="Série">
                <Link
                  href={`/compromissos?serie=${detail.recurrence.id}&situacao=abertos`}
                  className="text-primary-text underline"
                >
                  {detail.recurrence.label}
                </Link>
              </Row>
            ) : null}
            {detail.reversalOfId ? (
              <Row label="Estorno de">
                <Link
                  href={`/transacoes/${detail.reversalOfId}`}
                  className="text-primary-text underline"
                >
                  Ver lançamento original
                </Link>
              </Row>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <SplitSummary detail={split} />

      {showReversals ? (
        <Card className="[--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle className="text-base">Estornos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {detail.reversals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum estorno registrado.
              </p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {detail.reversals.map((reversal) => (
                  <li
                    key={reversal.id}
                    className="flex min-h-10 items-center justify-between gap-3 py-1"
                  >
                    <Link
                      href={`/transacoes/${reversal.id}`}
                      className="text-primary-text underline"
                    >
                      Estorno de {formatDateBR(reversal.transactionDate)}
                    </Link>
                    <Money cents={reversal.amount} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm">
              <span className="text-muted-foreground">
                Valor ainda estornável:{" "}
              </span>
              <Money cents={detail.reversibleAmount} className="font-medium" />
            </p>
          </CardContent>
        </Card>
      ) : null}

      {detail.history ? (
        <Card className="[--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle className="text-base">Histórico de alterações</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionHistory entries={detail.history} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
