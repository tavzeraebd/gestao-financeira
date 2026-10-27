import {
  CalendarClockIcon,
  PlusIcon,
  SearchXIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { buttonVariants } from "@/components/ui/button";
import { today } from "@/lib/dates";
import { listAccountOptions } from "@/modules/accounts/queries";
import { listBills, getBillsSummary } from "@/modules/bills/queries";
import { billFiltersSchema } from "@/modules/bills/schemas";
import { DEFAULT_BILL_SITUATION } from "@/modules/bills/constants";
import { BillFiltersBar } from "@/modules/bills/components/bill-filters-bar";
import { BillList } from "@/modules/bills/components/bill-list";
import { BillSummary } from "@/modules/bills/components/bill-summary";
import { LaunchSectionsNav } from "@/modules/bills/components/launch-sections-nav";
import { can } from "@/modules/family/permissions";
import { getFamilyOverview } from "@/modules/family/queries";

export const metadata: Metadata = { title: "Contas a pagar e receber" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstValues(raw: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = billFiltersSchema.parse(firstValues(await searchParams));
  const [overview, accounts] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
  ]);
  const activeAccounts = accounts
    .filter((a) => a.isActive)
    .map((a) => ({ id: a.id, name: a.name }));
  const newBill = (
    <Link href="/compromissos/novo" className={buttonVariants()}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      Novo compromisso
    </Link>
  );
  const header = (
    <>
      <LaunchSectionsNav />
      <PageHeader
        title="Contas a pagar e receber"
        description="Compromissos com vencimento. Só passam a contar no saldo quando são pagos."
        actions={newBill}
      />
    </>
  );

  if (accounts.length === 0) {
    const canManageAccounts = can(overview.myRole, "account.manage");
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={WalletIcon}
          title="Cadastre uma conta primeiro"
          description={
            canManageAccounts
              ? "Os compromissos ficam dentro de uma conta. Cadastre a primeira para começar."
              : "Os compromissos ficam dentro de uma conta. Peça a quem administra a família para cadastrar as contas."
          }
          action={
            canManageAccounts ? (
              <Link href="/contas/nova" className={buttonVariants()}>
                Cadastrar conta
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const [summary, page] = await Promise.all([
    getBillsSummary(),
    listBills(filters),
  ]);
  const hasFilters = Boolean(
    filters.tipo ||
    filters.de ||
    filters.ate ||
    filters.serie ||
    filters.situacao !== DEFAULT_BILL_SITUATION,
  );

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (filters.tipo) params.set("tipo", filters.tipo);
    if (filters.situacao !== DEFAULT_BILL_SITUATION) {
      params.set("situacao", filters.situacao);
    }
    if (filters.de) params.set("de", filters.de);
    if (filters.ate) params.set("ate", filters.ate);
    if (filters.serie) params.set("serie", filters.serie);
    if (filters.por_pagina !== 20) {
      params.set("por_pagina", String(filters.por_pagina));
    }
    if (target > 1) params.set("pagina", String(target));
    const query = params.toString();
    return query ? `/compromissos?${query}` : "/compromissos";
  };

  let body;
  if (page.items.length > 0) {
    body = (
      <>
        <BillList
          items={page.items}
          accounts={activeAccounts}
          today={today()}
        />
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {page.total === 1 ? "1 compromisso" : `${page.total} compromissos`}
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
  } else if (hasFilters) {
    body = (
      <EmptyState
        icon={SearchXIcon}
        title="Nenhum compromisso encontrado"
        description="Nenhum compromisso combina com os filtros escolhidos."
        action={
          <Link href="/compromissos" className={buttonVariants()}>
            Limpar filtros
          </Link>
        }
      />
    );
  } else {
    body = (
      <EmptyState
        icon={CalendarClockIcon}
        title="Nenhuma conta a pagar ou receber"
        description="Registre o que a família precisa pagar ou receber, com a data de vencimento."
        action={newBill}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <BillSummary summary={summary} />
      <BillFiltersBar
        state={{
          tipo: filters.tipo,
          situacao: filters.situacao,
          de: filters.de,
          ate: filters.ate,
          serie: filters.serie,
          por_pagina: filters.por_pagina,
        }}
        today={today()}
        serieName={
          page.items[0]?.recurrence ? page.items[0].description : undefined
        }
      />
      {body}
    </div>
  );
}
