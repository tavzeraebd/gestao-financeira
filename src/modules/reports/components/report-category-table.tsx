import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import type { CategoryReportRow } from "@/modules/reports/types";

type ReportCategoryTableProps = {
  rows: CategoryReportRow[];
  periodLabel: string;
  previousLabel: string;
  type: "expense" | "income";
};

/** Variação em texto com sinal; sem base de comparação diz isso em vez de "NaN%". */
function variationText(row: CategoryReportRow): string {
  const { percent } = row.comparison;
  return percent === null
    ? "Sem base de comparação"
    : formatPercent(percent, { signDisplay: "exceptZero" });
}

export function ReportCategoryTable({
  rows,
  periodLabel,
  previousLabel,
  type,
}: ReportCategoryTableProps) {
  const direction = type === "income" ? "in" : "out";
  return (
    <Table>
      <TableCaption className="sr-only">
        {type === "income" ? "Receitas" : "Despesas"} por categoria em{" "}
        {periodLabel}, comparadas com {previousLabel}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Categoria</TableHead>
          <TableHead scope="col" className="text-right">
            {periodLabel}
          </TableHead>
          <TableHead scope="col" className="text-right">
            Anterior
            <span className="sr-only"> ({previousLabel})</span>
          </TableHead>
          <TableHead scope="col" className="text-right">
            Variação
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.categoryId} data-testid="linha-categoria">
            <TableCell>
              <span className="flex min-w-0 items-center gap-2">
                <CategoryIcon
                  icon={row.icon ?? "ellipsis"}
                  color={row.color}
                  size="sm"
                />
                <span className="min-w-0 break-words">{row.name}</span>
                {row.archived ? (
                  <Badge variant="outline">Arquivada</Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Money cents={row.current} direction={direction} />
            </TableCell>
            <TableCell className="text-right">
              <Money cents={row.previous} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {variationText(row)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
