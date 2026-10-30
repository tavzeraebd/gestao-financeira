import { ChevronRightIcon, TrendingUpIcon } from "lucide-react";

import { Money } from "@/components/shared/money";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import type { Dashboard } from "@/modules/reports/types";

import { ComparisonText } from "./comparison-text";
import { DetailTrigger } from "./commitment-detail-provider";
import { IndicatorInfo } from "./indicator-info";

type BalanceCardProps = Pick<
  Dashboard,
  "consolidated" | "previousAsOf" | "openCardDebt" | "hasCreditCards"
>;

export function BalanceCard({
  consolidated,
  previousAsOf,
  openCardDebt,
  hasCreditCards,
}: BalanceCardProps) {
  return (
    <Card data-testid="indicador-saldo-total" className="h-full">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <h2 className="text-muted-foreground text-sm font-medium">
              Saldo atual
            </h2>
            <IndicatorInfo id="consolidatedBalance" />
          </div>
          <TrendingUpIcon
            aria-hidden="true"
            className="text-muted-foreground size-5"
          />
        </div>
        <p className="text-3xl font-bold" data-testid="valor">
          <DetailTrigger
            view={{ kind: "accounts" }}
            className="hover:bg-muted -mx-2 inline-flex items-center gap-1 px-2 py-1 transition-colors"
          >
            <Money cents={consolidated.current} />
            <ChevronRightIcon
              aria-hidden="true"
              className="text-muted-foreground size-5 shrink-0"
            />
            <span className="sr-only">Ver saldo por conta</span>
          </DetailTrigger>
        </p>
        <ComparisonText
          comparison={consolidated}
          against={formatDateBR(previousAsOf)}
        />
        {hasCreditCards ? (
          <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              Faturas em aberto
              <IndicatorInfo id="openCardDebt" />
            </span>
            <Money cents={openCardDebt} className="font-medium" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
