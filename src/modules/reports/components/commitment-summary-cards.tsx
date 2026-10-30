import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { asCents, formatBRL } from "@/lib/money";
import type {
  BalanceSnapshot,
  CommitmentOverview,
  ProjectedBalance,
} from "@/modules/reports/types";

import { BalanceCard } from "./balance-card";
import { DetailTrigger } from "./commitment-detail-provider";
import type { DetailView } from "./commitment-detail-views";
import { commitmentItemHref } from "@/modules/reports/domain/commitment-details";

const ACTION_CLASS =
  "-m-1.5 flex min-h-10 flex-col gap-0.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted";

/** Link de detalhe ou visão do diálogo; sem destino, o resumo fica só de leitura. */
type SummaryTarget =
  { kind: "view"; view: DetailView } | { kind: "link"; href: string } | null;

function SummaryCard({
  title,
  testId,
  value,
  note,
  target,
  alert = false,
}: {
  alert?: boolean;
  title: string;
  testId: string;
  value: string;
  note: string;
  target: SummaryTarget;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span
          className="block text-xl font-bold tabular-nums xl:text-2xl"
          data-testid="valor"
        >
          {value}
        </span>
        {target ? (
          <ChevronRightIcon
            aria-hidden="true"
            className="text-muted-foreground mt-1 size-4 shrink-0"
          />
        ) : null}
      </span>
      {alert ? (
        <span className="text-destructive flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="line-clamp-2">{note}</span>
        </span>
      ) : (
        <span className="text-muted-foreground line-clamp-2 block text-xs">
          {note}
        </span>
      )}
      {target ? <span className="sr-only">Ver detalhes</span> : null}
    </>
  );
  return (
    <Card data-testid={testId} size="sm" className="h-full">
      <CardContent className="flex flex-col gap-1">
        <h2 className="text-muted-foreground text-xs font-medium">{title}</h2>
        {target === null ? (
          <div className="flex flex-col gap-0.5">{body}</div>
        ) : target.kind === "link" ? (
          <Link
            href={target.href}
            className={`${ACTION_CLASS} focus-visible:ring-ring outline-none focus-visible:ring-3`}
          >
            {body}
          </Link>
        ) : (
          <DetailTrigger view={target.view} className={ACTION_CLASS}>
            {body}
          </DetailTrigger>
        )}
      </CardContent>
    </Card>
  );
}

/** Saldo atual em destaque e três resumos do mês corrente; valores em texto, sem depender de cor. */
export function CommitmentSummaryCards({
  overview,
  balance,
  projection,
}: {
  overview: CommitmentOverview;
  balance: BalanceSnapshot;
  projection: ProjectedBalance;
}) {
  const { months, nextDue } = overview;
  const current = months[0];
  const endOfMonth = projection.months[0];
  const currentNote =
    current?.percent != null
      ? `${formatPercent(current.percent)} da receita esperada do mês`
      : "Sem receita esperada para calcular o percentual";
  const monthTarget: SummaryTarget = current
    ? { kind: "view", view: { kind: "month", month: current.month } }
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <BalanceCard {...balance} />
      <SummaryCard
        title="Comprometido no mês"
        testId="resumo-mes-atual"
        value={formatBRL(current?.committed ?? asCents(0))}
        note={currentNote}
        target={monthTarget}
      />
      <SummaryCard
        title="Próximo vencimento"
        testId="resumo-proximo-vencimento"
        value={nextDue ? formatBRL(nextDue.amount) : "—"}
        note={
          nextDue
            ? `${nextDue.description}, ${
                nextDue.overdue ? "venceu em" : "vence em"
              } ${formatDateBR(nextDue.date)}`
            : "Nenhum vencimento em aberto neste mês"
        }
        target={
          nextDue
            ? {
                kind: "link",
                href: commitmentItemHref(nextDue.origin, nextDue.sourceId),
              }
            : null
        }
      />
      <SummaryCard
        title="Saldo projetado no fim do mês"
        testId="resumo-saldo-fim-do-mes"
        value={endOfMonth ? formatBRL(endOfMonth.balance) : "—"}
        alert={endOfMonth?.negative ?? false}
        target={monthTarget}
        note={
          endOfMonth
            ? `${endOfMonth.negative ? "Saldo negativo no fim de " : "No fim de "}${endOfMonth.longLabel}`
            : "Sem mês corrente"
        }
      />
    </div>
  );
}
