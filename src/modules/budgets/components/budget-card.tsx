import {
  CircleCheckIcon,
  OctagonAlertIcon,
  PencilIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { ProgressMeter } from "@/components/shared/progress-meter";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { negCents } from "@/lib/money";
import {
  ALL_EXPENSES_LABEL,
  BUDGET_STATUS_LABELS,
} from "@/modules/budgets/constants";
import type { BudgetStatus, BudgetView } from "@/modules/budgets/types";
import { BudgetStatusButton } from "./budget-status-button";

const STATUS_VIEW: Record<
  BudgetStatus,
  {
    variant: "success" | "warning" | "danger";
    tone: "default" | "warning" | "danger";
    icon: ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
  }
> = {
  ok: { variant: "success", tone: "default", icon: CircleCheckIcon },
  attention: { variant: "warning", tone: "warning", icon: TriangleAlertIcon },
  exceeded: { variant: "danger", tone: "danger", icon: OctagonAlertIcon },
};

/** Só formata o percentual que já vem calculado (`budgetProgress`). */
function percentText(percent: number | null): string {
  return percent === null ? "Sem gastos" : `${Math.round(percent)}%`;
}

export function BudgetCard({ budget: b }: { budget: BudgetView }) {
  const name = b.category?.name ?? ALL_EXPENSES_LABEL;
  const view = STATUS_VIEW[b.status];
  const StatusIcon = view.icon;
  const archived = b.archivedAt !== null;
  return (
    <Card className="[--card-spacing:--spacing(5)]" data-testid="orcamento">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {b.category ? (
              <CategoryIcon icon={b.category.icon} color={b.category.color} />
            ) : null}
            <div className="flex min-w-0 flex-col items-start gap-1">
              <h2 className="truncate text-base font-semibold">{name}</h2>
              {b.category?.archived ? (
                <Badge variant="outline">Categoria arquivada</Badge>
              ) : null}
            </div>
          </div>
          <Badge variant={view.variant} className="shrink-0">
            <StatusIcon aria-hidden="true" />
            {BUDGET_STATUS_LABELS[b.status]}
          </Badge>
        </div>

        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span>
              <Money cents={b.spent} className="font-semibold" /> de{" "}
              <Money cents={b.amountLimit} />
            </span>
            <span className="font-semibold tabular-nums">
              {percentText(b.percent)}
            </span>
          </p>
          <ProgressMeter
            value={b.percent}
            tone={view.tone}
            label={`Uso do orçamento ${name}`}
            valueText={
              b.percent === null
                ? "Sem gastos no mês"
                : `${percentText(b.percent)} do limite`
            }
          />
          <p className="text-sm">
            {b.available < 0 ? (
              <>
                Acima do limite em <Money cents={negCents(b.available)} />
              </>
            ) : (
              <>
                Disponível <Money cents={b.available} />
              </>
            )}
          </p>
          <p className="text-muted-foreground text-sm">
            Previsto em compromissos <Money cents={b.committed} />
          </p>
        </div>

        {b.history.length > 0 ? (
          <div>
            <h3 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
              Meses anteriores
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">% do limite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.history.map((h) => (
                  <TableRow key={h.month}>
                    <TableCell>{h.label}</TableCell>
                    <TableCell className="text-right">
                      <Money cents={h.spent} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percentText(h.percent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {b.canManage ? (
          <div className="flex flex-wrap gap-2">
            {archived ? null : (
              <Link
                href={`/orcamentos/${b.id}/editar`}
                className={buttonVariants({ variant: "outline" })}
                aria-label={`Editar orçamento ${name}`}
              >
                <PencilIcon aria-hidden="true" data-icon="inline-start" />
                Editar
              </Link>
            )}
            <BudgetStatusButton
              budgetId={b.id}
              name={name}
              archived={archived}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
