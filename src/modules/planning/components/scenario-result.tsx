import { AlertCircleIcon } from "lucide-react";

import { Money } from "@/components/shared/money";
import { ValueSourceBadge } from "@/components/shared/value-source-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMonthBR, type ISODate } from "@/lib/dates";
import { formatBRL, type Cents } from "@/lib/money";
import type { ProjectionResult, ResultLine, SimulationResult } from "@/modules/planning/types";

export type ScenarioOutcome = SimulationResult | ProjectionResult;

/** Só formatação de exibição: os valores já vêm calculados pelo domínio. */
export function formatResultValue(line: ResultLine): string {
  switch (line.format) {
    case "brl":
      return formatBRL(line.value as Cents);
    case "months": {
      const n = line.value as number;
      return `${n} ${n === 1 ? "mês" : "meses"}`;
    }
    case "percent":
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(line.value as number)}%`;
    case "month":
      return formatMonthBR(line.value as ISODate, "long");
    case "text":
      return String(line.value);
  }
}

function ErrorNotice({ error }: { error: "OUT_OF_RANGE" | "NO_BASELINE" }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>Não foi possível simular</AlertTitle>
      <AlertDescription>
        {error === "NO_BASELINE"
          ? "Faltam dados da família para esta simulação. Cadastre uma conta e registre lançamentos."
          : "Os valores informados estão fora dos limites. Revise os campos e simule de novo."}
      </AlertDescription>
    </Alert>
  );
}

export function ScenarioResult({ outcome }: { outcome: ScenarioOutcome }) {
  if (!outcome.ok) return <ErrorNotice error={outcome.error} />;
  const rows = "rows" in outcome ? outcome.rows : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">
          {outcome.headline.label}
        </p>
        <p className="text-3xl font-bold break-words tabular-nums">
          {formatResultValue(outcome.headline)}
        </p>
        <div>
          <ValueSourceBadge source={outcome.headline.source} />
        </div>
      </div>

      {outcome.lines.length > 0 ? (
        <dl className="divide-y">
          {outcome.lines.map((line) => (
            <div
              key={line.label}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="flex items-center gap-2 font-medium">
                <span className="tabular-nums">{formatResultValue(line)}</span>
                <ValueSourceBadge source={line.source} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {rows ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableCaption className="sr-only">Saldo futuro por mês</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Mês</TableHead>
                <TableHead scope="col" className="text-right">
                  Entradas previstas
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Saídas previstas
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Saldo projetado
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="whitespace-nowrap">{row.label}</TableCell>
                  <TableCell className="text-right">
                    <Money cents={row.income} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={row.expense} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Money cents={row.balance} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {outcome.premises.length > 0 ? (
        <section aria-labelledby="premissas-titulo" className="flex flex-col gap-2">
          <h3 id="premissas-titulo" className="text-sm font-semibold">
            Premissas
          </h3>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {outcome.premises.map((premise) => (
              <li key={premise}>{premise}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
