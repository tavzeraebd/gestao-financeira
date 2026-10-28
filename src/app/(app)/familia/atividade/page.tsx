import { ArrowLeftIcon, HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { buttonVariants } from "@/components/ui/button";
import { today } from "@/lib/dates";
import { ActivityFiltersBar } from "@/modules/activity/components/activity-filters-bar";
import { ActivityList } from "@/modules/activity/components/activity-list";
import { DEFAULT_ACTIVITY_PAGE_SIZE } from "@/modules/activity/constants";
import { listActivity } from "@/modules/activity/queries";
import { activityFiltersSchema } from "@/modules/activity/schemas";

export const metadata: Metadata = { title: "Atividade da família" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function FamilyActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const filters = activityFiltersSchema.parse(raw);
  const activity = await listActivity(raw);
  // Integrante comum não vê a auditoria (AB-118): a rota não existe para ele.
  if (!activity) notFound();

  const hasFilters = Boolean(filters.grupo || filters.de || filters.ate);

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (filters.grupo) params.set("grupo", filters.grupo);
    if (filters.de) params.set("de", filters.de);
    if (filters.ate) params.set("ate", filters.ate);
    if (filters.por_pagina !== DEFAULT_ACTIVITY_PAGE_SIZE) {
      params.set("por_pagina", String(filters.por_pagina));
    }
    if (target > 1) params.set("pagina", String(target));
    const query = params.toString();
    return query ? `/familia/atividade?${query}` : "/familia/atividade";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atividade da família"
        description="Alterações, exclusões, pagamentos e mudanças na família. A criação de lançamentos não aparece aqui."
        actions={
          <Link
            href="/familia"
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            Voltar para Família
          </Link>
        }
      />
      <ActivityFiltersBar
        state={{
          grupo: filters.grupo,
          de: filters.de,
          ate: filters.ate,
          por_pagina: filters.por_pagina,
        }}
        today={today()}
      />
      {activity.items.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nenhuma atividade registrada"
          description={
            hasFilters
              ? "Nada corresponde aos filtros. Amplie o período ou limpe os filtros."
              : "Quando alguém alterar, excluir ou pagar algo, o registro aparece aqui."
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {activity.total === 1
              ? "1 registro"
              : `${activity.total} registros`}
          </p>
          <ActivityList items={activity.items} />
          <PaginationNav
            page={activity.page}
            pageCount={activity.pageCount}
            hrefForPage={hrefForPage}
          />
        </>
      )}
    </div>
  );
}
