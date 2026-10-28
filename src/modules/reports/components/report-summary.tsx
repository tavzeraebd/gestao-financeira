import { Money } from "@/components/shared/money";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { IndicatorId } from "@/modules/reports/definitions";
import type { Comparison, ReportOverview } from "@/modules/reports/types";

import { ComparisonText } from "./comparison-text";
import { IndicatorInfo } from "./indicator-info";

type ReportSummaryProps = {
  summary: ReportOverview["summary"];
  previousLabel: string;
};

function Indicator({
  id,
  title,
  testId,
  comparison,
  against,
  direction,
}: {
  id: IndicatorId;
  title: string;
  testId: string;
  comparison: Comparison;
  against: string;
  direction: "in" | "out" | "neutral";
}) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
        <IndicatorInfo id={id} />
      </div>
      <p className="text-xl font-bold" data-testid="valor">
        <Money
          cents={comparison.current}
          direction={comparison.current === 0 ? "neutral" : direction}
        />
      </p>
      <ComparisonText comparison={comparison} against={against} />
    </div>
  );
}

/** "Resumo do período": receitas, despesas e resultado, com a variação em texto. */
export function ReportSummary({ summary, previousLabel }: ReportSummaryProps) {
  const { income, expense, result } = summary;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-foreground text-base font-semibold">
          Resumo do período
        </h2>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Indicator
          id="income"
          title="Receitas"
          testId="indicador-receitas"
          comparison={income}
          against={previousLabel}
          direction="in"
        />
        <Indicator
          id="expense"
          title="Despesas"
          testId="indicador-despesas"
          comparison={expense}
          against={previousLabel}
          direction="out"
        />
        <Indicator
          id="result"
          title="Resultado"
          testId="indicador-resultado"
          comparison={result}
          against={previousLabel}
          direction={
            result.current > 0 ? "in" : result.current < 0 ? "out" : "neutral"
          }
        />
      </CardContent>
    </Card>
  );
}
