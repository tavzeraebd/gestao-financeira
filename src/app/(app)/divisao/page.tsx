import { PlusIcon, SearchXIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { buttonVariants } from "@/components/ui/button";
import { LaunchSectionsNav } from "@/modules/bills/components/launch-sections-nav";
import { DEFAULT_SPLIT_FILTER } from "@/modules/splits/constants";
import { BalancesCard } from "@/modules/splits/components/balances-card";
import { SharedExpenseList } from "@/modules/splits/components/shared-expense-list";
import { SplitFilterTabs } from "@/modules/splits/components/split-filter-tabs";
import {
  getMemberBalances,
  listSharedExpenses,
} from "@/modules/splits/queries";
import { splitFiltersSchema } from "@/modules/splits/schemas";

export const metadata: Metadata = { title: "Divisão de contas" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstValues(raw: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

export default async function SplitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = splitFiltersSchema.parse(firstValues(await searchParams));
  const [balances, page] = await Promise.all([
    getMemberBalances(),
    listSharedExpenses(filters),
  ]);

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (filters.situacao !== DEFAULT_SPLIT_FILTER) {
      params.set("situacao", filters.situacao);
    }
    if (filters.por_pagina !== 20) {
      params.set("por_pagina", String(filters.por_pagina));
    }
    if (target > 1) params.set("pagina", String(target));
    const query = params.toString();
    return query ? `/divisao?${query}` : "/divisao";
  };

  let body;
  if (page.items.length > 0) {
    body = (
      <>
        <SharedExpenseList items={page.items} />
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {page.total === 1
              ? "1 despesa dividida"
              : `${page.total} despesas divididas`}
          </p>
          <PaginationNav
            page={page.page}
            pageCount={page.pageCount}
            hrefForPage={hrefFor}
          />
        </div>
      </>
    );
  } else if (page.total > 0) {
    body = (
      <EmptyState
        icon={SearchXIcon}
        title="Esta página não existe mais"
        description="Os resultados terminaram antes desta página."
        action={
          <Link href={hrefFor(1)} className={buttonVariants()}>
            Ir para a primeira página
          </Link>
        }
      />
    );
  } else if (filters.situacao !== DEFAULT_SPLIT_FILTER) {
    body = (
      <EmptyState
        icon={SearchXIcon}
        title="Nenhuma despesa encontrada"
        description="Nenhuma despesa dividida combina com esta situação."
        action={
          <Link href="/divisao" className={buttonVariants()}>
            Ver todas
          </Link>
        }
      />
    );
  } else {
    body = (
      <EmptyState
        icon={UsersIcon}
        title="Nenhuma despesa dividida"
        description="Para dividir, abra uma despesa ou conta a pagar e escolha Dividir despesa."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <LaunchSectionsNav />
      <PageHeader
        title="Divisão de contas"
        description="Quanto cabe a cada integrante nas despesas compartilhadas e quem deve a quem."
        actions={
          <Link href="/compromissos/novo" className={buttonVariants()}>
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            Adicionar conta
          </Link>
        }
      />
      <BalancesCard balances={balances} />
      <SplitFilterTabs active={filters.situacao} />
      {body}
    </div>
  );
}
