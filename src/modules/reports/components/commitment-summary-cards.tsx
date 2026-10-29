import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type { CommitmentOverview } from "@/modules/reports/types";

function SummaryCard({
  title,
  testId,
  value,
  note,
}: {
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
        <p className="text-muted-foreground text-sm">{note}</p>
      </CardContent>
    </Card>
  );
}

/** Quatro resumos do comprometimento futuro; valores em texto, sem depender de cor. */
export function CommitmentSummaryCards({
  overview,
}: {
  overview: CommitmentOverview;
}) {
  const { months, nextDue, heaviest } = overview;
  const current = months[0];
  const currentNote =
    current?.percent != null
      ? `${formatPercent(current.percent)} da receita esperada do mês`
      : "Sem receita esperada para calcular o percentual";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
