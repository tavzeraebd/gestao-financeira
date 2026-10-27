import type { ReactNode } from "react";

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

export type ResponsiveListColumn<T> = {
  id: string;
  header: string;
  cell: (item: T) => ReactNode;
  align?: "start" | "end";
  className?: string;
};

type ResponsiveListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  /** Nome acessível da tabela (leitores de tela). */
  caption: string;
  columns: ResponsiveListColumn<T>[];
  renderCard: (item: T) => ReactNode;
};

/**
 * A partir de `md`: tabela. Abaixo: lista de cartões. A versão oculta usa `hidden` (display: none),
 * por isso sai da árvore de acessibilidade. Sem "use client": aceita funções vindas de Server Components.
 */
export function ResponsiveList<T>({
  items,
  getKey,
  caption,
  columns,
  renderCard,
}: ResponsiveListProps<T>) {
  return (
    <>
      <div className="bg-card hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  scope="col"
                  className={cn(
                    column.align === "end" && "text-right",
                    column.className,
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={getKey(item)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      column.align === "end" && "text-right",
                      column.className,
                    )}
                  >
                    {column.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label={caption} className="flex flex-col gap-2 md:hidden">
        {items.map((item) => (
          <li key={getKey(item)} className="bg-card rounded-xl border p-4">
            {renderCard(item)}
          </li>
        ))}
      </ul>
    </>
  );
}
