import { Money } from "@/components/shared/money";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { IndicatorId } from "@/modules/reports/definitions";
import type { Comparison, Dashboard } from "@/modules/reports/types";

import { ComparisonText } from "./comparison-text";
import { IndicatorInfo } from "./indicator-info";

type SummaryIndicatorsProps = Pick<
  Dashboard,
  "income" | "expense" | "result"
> & {
  previousLabel: string;
};

function Indicator({
  id,
  title,
  testId,
  comparison,
  against,
  direction,
  className,
}: {
  id: IndicatorId;
  title: string;
  testId: string;
  comparison: Comparison;
  against: string;
  direction: "in" | "out" | "neutral";
  className?: string;
}) {
  return (
    <Card data-testid={testId} className={cn("h-full", className)}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
          <IndicatorInfo id={id} />
        </div>
        <p className="text-xl font-bold" data-testid="valor">
          <Money
            cents={comparison.current}
            direction={comparison.current === 0 ? "neutral" : direction}
          />
        </p>
        <ComparisonText comparison={comparison} against={against} />
      </CardContent>
    </Card>
  );
}

/**
 * Receitas e Despesas lado a lado no celular (tela 10), Resultado abaixo; em telas largas, os
 * três empilham na coluna do meio.
 */
export function SummaryIndicators({
  income,
  expense,
  result,
  previousLabel,
}: SummaryIndicatorsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
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
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
}
