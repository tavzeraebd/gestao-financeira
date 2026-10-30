import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
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
  "-m-2 flex flex-col gap-2 rounded-md p-2 text-left transition-colors hover:bg-muted";

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
          className="block text-xl font-bold tabular-nums"
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
        <span className="text-destructive flex items-center gap-1.5 text-sm font-medium">
          <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          <span>{note}</span>
        </span>
      ) : (
        <span className="text-muted-foreground block text-sm">{note}</span>
      )}
      {target ? <span className="sr-only">Ver detalhes</span> : null}
    </>
  );
  return (
    <Card data-testid={testId} className="h-full">
      <CardContent className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
        {target === null ? (
          <div className="flex flex-col gap-2">{body}</div>
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

/** Saldo atual em destaque e cinco resumos do comprometimento futuro; valores em texto, sem depender de cor. */
export function CommitmentSummaryCards({
  overview,
  balance,
  projection,
}: {
  overview: CommitmentOverview;
  balance: BalanceSnapshot;
  projection: ProjectedBalance;
}) {
  const { lowest } = projection;
  const { months, nextDue, heaviest } = overview;
  const current = months[0];
  const currentNote =
    current?.percent != null
      ? `${formatPercent(current.percent)} da receita esperada do mês`
      : "Sem receita esperada para calcular o percentual";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <BalanceCard {...balance} />
      <SummaryCard
        title="Menor saldo projetado"
        testId="resumo-menor-saldo-projetado"
        value={lowest ? formatBRL(lowest.balance) : "—"}
        alert={lowest?.negative ?? false}
        target={lowest ? { kind: "view", view: { kind: "lowest" } } : null}
        note={
          lowest
            ? `${lowest.negative ? "Saldo negativo em " : "Em "}${lowest.longLabel}`
            : "Sem meses no período"
        }
      />
      <SummaryCard
        title="Total comprometido"
        testId="resumo-total-comprometido"
        value={formatBRL(overview.totalCommitted)}
        note={overview.label}
        target={
          overview.totalCommitted > 0
            ? { kind: "view", view: { kind: "total" } }
            : null
        }
      />
      <SummaryCard
        title="Comprometido neste mês"
        testId="resumo-mes-atual"
        value={formatBRL(overview.currentMonthCommitted)}
        note={currentNote}
        target={
          current
            ? { kind: "view", view: { kind: "month", month: current.month } }
            : null
        }
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
            : "Nenhum vencimento em aberto"
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
        title="Mês mais pesado"
        testId="resumo-mes-mais-pesado"
        value={heaviest ? formatBRL(heaviest.committed) : "—"}
        note={heaviest ? heaviest.longLabel : "Nenhum compromisso no período"}
        target={
          heaviest
            ? { kind: "view", view: { kind: "month", month: heaviest.month } }
            : null
        }
      />
    </div>
  );
}
