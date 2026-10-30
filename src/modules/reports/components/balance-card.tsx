import { ChevronRightIcon } from "lucide-react";

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
    <Card data-testid="indicador-saldo-total" size="sm" className="h-full">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <h2 className="text-muted-foreground text-xs font-medium">
            Saldo atual
          </h2>
          <IndicatorInfo id="consolidatedBalance" />
        </div>
        <p className="text-xl font-bold xl:text-2xl" data-testid="valor">
          <DetailTrigger
            view={{ kind: "accounts" }}
            className="hover:bg-muted -mx-1.5 inline-flex min-h-10 items-center gap-1 rounded-md px-1.5 py-1 transition-colors"
          >
            <Money cents={consolidated.current} />
            <ChevronRightIcon
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="sr-only">Ver saldo por conta</span>
          </DetailTrigger>
        </p>
        <ComparisonText
          comparison={consolidated}
          against={formatDateBR(previousAsOf)}
        />
        {hasCreditCards ? (
          <div className="flex items-center justify-between gap-2 text-xs">
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
