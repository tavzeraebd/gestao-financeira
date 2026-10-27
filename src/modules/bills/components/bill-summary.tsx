import { Money } from "@/components/shared/money";
import { Card, CardContent } from "@/components/ui/card";
import type { BillsSummary } from "@/modules/bills/types";

/** Resumo (D19): números prontos do servidor, sem conta no componente. */
export function BillSummary({ summary }: { summary: BillsSummary }) {
  return (
    <section
      aria-label="Resumo dos compromissos"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      data-testid="resumo-compromissos"
    >
      <Card className="[--card-spacing:--spacing(4)]">
        <CardContent className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">A pagar em aberto</p>
          <p className="text-xl font-bold">
            <Money cents={summary.payable} />
          </p>
        </CardContent>
      </Card>
      <Card className="[--card-spacing:--spacing(4)]">
        <CardContent className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">A receber em aberto</p>
          <p className="text-xl font-bold">
            <Money cents={summary.receivable} />
          </p>
        </CardContent>
      </Card>
      <Card className="[--card-spacing:--spacing(4)]">
        <CardContent className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">
            Vencidos ({summary.overdueCount})
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">A pagar </span>
            <Money cents={summary.overduePayable} className="font-semibold" />
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">A receber </span>
            <Money
              cents={summary.overdueReceivable}
              className="font-semibold"
            />
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
