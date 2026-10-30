"use client";

import { useId, useState, type ReactNode } from "react";
import { BarChart3Icon, TableIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ChartCardTable = {
  caption: string;
  columns: { id: string; header: string; align?: "start" | "end" }[];
  rows: { key: string; cells: ReactNode[] }[];
};

export type ChartCardProps = {
  title: string;
  period: string;
  info?: ReactNode;
  isEmpty: boolean;
  empty: { title: string; description?: string; action?: ReactNode };
  table: ChartCardTable;
  legend?: ReactNode;
  children: ReactNode;
};

/**
 * Moldura de todo gráfico: título (h2) e período visíveis, legenda em texto e
 * botão "Ver tabela"/"Ver gráfico" que troca o gráfico pelos mesmos dados em tabela.
 */
export function ChartCard({
  title,
  period,
  info,
  isEmpty,
  empty,
  table,
  legend,
  children,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const regionId = useId();
  const tableVisible = showTable && !isEmpty;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 className="text-foreground text-base font-semibold">
                {title}
              </h2>
              {info}
            </div>
            <p className="text-muted-foreground text-sm">{period}</p>
          </div>
          {isEmpty ? null : (
            <Button
              type="button"
              variant="outline"
              aria-expanded={tableVisible}
              aria-controls={regionId}
              onClick={() => setShowTable((v) => !v)}
            >
              {tableVisible ? (
                <BarChart3Icon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <TableIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {tableVisible ? "Ver gráfico" : "Ver tabela"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div id={regionId}>
          {isEmpty ? (
            <EmptyState
              title={empty.title}
              description={empty.description}
              action={empty.action}
            />
          ) : tableVisible ? (
            <Table>
              <TableCaption className="sr-only">{table.caption}</TableCaption>
              <TableHeader>
                <TableRow>
                  {table.columns.map((column) => (
                    <TableHead
                      key={column.id}
                      scope="col"
                      className={cn(column.align === "end" && "text-right")}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row) => (
                  <TableRow key={row.key}>
                    {row.cells.map((cell, index) => (
                      <TableCell
                        key={table.columns[index]?.id ?? index}
                        className={cn(
                          table.columns[index]?.align === "end" &&
                            "text-right tabular-nums",
                        )}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            children
          )}
        </div>
        {legend && !isEmpty ? legend : null}
      </CardContent>
    </Card>
  );
}
