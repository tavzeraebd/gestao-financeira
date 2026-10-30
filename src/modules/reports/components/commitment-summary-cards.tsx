import { TriangleAlertIcon } from "lucide-react";

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

function SummaryCard({
  title,
  testId,
  value,
  note,
  alert = false,
}: {
  alert?: boolean;
  title: string;
  testId: string;
  value: string;
  note: string;
}) {
  return (
    <Card data-testid={testId} className="h-full">
      <CardContent className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
        <p className="text-xl font-bold tabular-nums" data-testid="valor">
          {value}
        </p>
        {alert ? (
          <p className="text-destructive flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
            <span>{note}</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{note}</p>
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
      />
      <SummaryCard
        title="Comprometido neste mês"
        testId="resumo-mes-atual"
        value={formatBRL(overview.currentMonthCommitted)}
        note={currentNote}
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
      />
      <SummaryCard
        title="Mês mais pesado"
        testId="resumo-mes-mais-pesado"
        value={heaviest ? formatBRL(heaviest.committed) : "—"}
        note={heaviest ? heaviest.longLabel : "Nenhum compromisso no período"}
      />
    </div>
  );
}
