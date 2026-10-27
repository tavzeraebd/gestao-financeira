import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

type PaginationNavProps = {
  page: number;
  pageCount: number;
  hrefForPage: (page: number) => string;
};

const MAX_NUMBERS = 5;

function visiblePages(page: number, pageCount: number): number[] {
  const count = Math.min(MAX_NUMBERS, pageCount);
  let start = Math.max(1, page - Math.floor(count / 2));
  start = Math.min(start, pageCount - count + 1);
  return Array.from({ length: count }, (_, i) => start + i);
}

const stepClass = cn(buttonVariants({ variant: "ghost" }), "gap-1 px-3");

function Step({
  direction,
  target,
  hrefForPage,
}: {
  direction: "prev" | "next";
  target: number | null;
  hrefForPage: (page: number) => string;
}) {
  const label = direction === "prev" ? "Anterior" : "Próxima";
  const content =
    direction === "prev" ? (
      <>
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        {label}
      </>
    ) : (
      <>
        {label}
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </>
    );
  if (target === null) {
    return (
      <span
        aria-disabled="true"
        className={cn(stepClass, "pointer-events-none opacity-50")}
      >
        {content}
      </span>
    );
  }
  return (
    <Link href={hrefForPage(target)} className={stepClass}>
      {content}
    </Link>
  );
}

/** Paginação por links (a página fica na URL). Não renderiza nada com uma página só. */
export function PaginationNav({
  page,
  pageCount,
  hrefForPage,
}: PaginationNavProps) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(page, 1), pageCount);

  return (
    <Pagination aria-label="Paginação">
      <PaginationContent className="gap-1">
        <PaginationItem>
          <Step
            direction="prev"
            target={current > 1 ? current - 1 : null}
            hrefForPage={hrefForPage}
          />
        </PaginationItem>
        <PaginationItem className="text-muted-foreground px-2 text-sm md:hidden">
          Página {current} de {pageCount}
        </PaginationItem>
        {visiblePages(current, pageCount).map((n) => (
          <PaginationItem key={n} className="hidden md:block">
            <Link
              href={hrefForPage(n)}
              aria-label={`Página ${n}`}
              aria-current={n === current ? "page" : undefined}
              className={cn(
                buttonVariants({
                  variant: n === current ? "outline" : "ghost",
                  size: "icon",
                }),
                "tabular-nums",
                n === current && "border-ring font-semibold",
              )}
            >
              {n}
            </Link>
          </PaginationItem>
        ))}
        <PaginationItem>
          <Step
            direction="next"
            target={current < pageCount ? current + 1 : null}
            hrefForPage={hrefForPage}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
