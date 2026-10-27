import {
  ArrowLeftRightIcon,
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
import { LaunchSectionsNav } from "@/modules/bills/components/launch-sections-nav";
import { today } from "@/lib/dates";
import { listAccountOptions } from "@/modules/accounts/queries";
import { listCategories } from "@/modules/categories/queries";
import { can } from "@/modules/family/permissions";
import { getFamilyOverview } from "@/modules/family/queries";
import {
  TransactionFiltersBar,
  type FilterState,
} from "@/modules/transactions/components/transaction-filters-bar";
import { TransactionList } from "@/modules/transactions/components/transaction-list";
import { listTransactions } from "@/modules/transactions/queries";
import { transactionFiltersSchema } from "@/modules/transactions/schemas";

export const metadata: Metadata = { title: "Transações" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstValues(raw: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = transactionFiltersSchema.parse(
    firstValues(await searchParams),
  );
  const [overview, accounts, categories] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
    listCategories({ includeArchived: true }),
  ]);
  const canManageAccounts = can(overview.myRole, "account.manage");
  const newTransaction = (
    <Link href="/transacoes/nova" className={buttonVariants()}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      Nova transação
    </Link>
  );

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <LaunchSectionsNav />
        <PageHeader
          title="Transações"
          description="Receitas, despesas e transferências da família."
        />
        <EmptyState
          icon={WalletIcon}
          title="Cadastre uma conta primeiro"
          description={
            canManageAccounts
              ? "Os lançamentos ficam dentro de uma conta. Cadastre a primeira para começar."
              : "Os lançamentos ficam dentro de uma conta. Peça a quem administra a família para cadastrar as contas."
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

  const page = await listTransactions(filters);
  const state: FilterState = {
    de: filters.de,
    ate: filters.ate,
    tipo: filters.tipo,
    conta: filters.conta,
    categoria: filters.categoria,
    responsavel: filters.responsavel,
    q: filters.q,
    ordem: filters.ordem,
    por_pagina: filters.por_pagina,
  };
  const hasFilters = Boolean(
    state.de ||
    state.ate ||
    state.tipo ||
    state.conta ||
    state.categoria ||
    state.responsavel ||
    state.q,
  );

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    for (const key of [
      "de",
      "ate",
      "tipo",
      "conta",
      "categoria",
      "responsavel",
      "q",
    ] as const) {
      const value = state[key];
      if (value) params.set(key, value);
    }
    if (state.ordem !== "data_desc") params.set("ordem", state.ordem);
    if (state.por_pagina !== 20) {
      params.set("por_pagina", String(state.por_pagina));
    }
    if (target > 1) params.set("pagina", String(target));
    const query = params.toString();
    return query ? `/transacoes?${query}` : "/transacoes";
  };

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.archivedAt ? `${c.name} (arquivada)` : c.name,
  }));

  let body;
  if (page.items.length > 0) {
    body = (
      <>
        <TransactionList items={page.items} />
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {page.total === 1 ? "1 lançamento" : `${page.total} lançamentos`}
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
        title="Nenhum lançamento encontrado"
        description="Nenhum lançamento combina com os filtros escolhidos."
        action={
          <Link href="/transacoes" className={buttonVariants()}>
            Limpar filtros
          </Link>
        }
      />
    );
  } else {
    body = (
      <EmptyState
        icon={ArrowLeftRightIcon}
        title="Nenhum lançamento ainda"
        description="Registre a primeira receita, despesa ou transferência da família."
        action={newTransaction}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <LaunchSectionsNav />
      <PageHeader
        title="Transações"
        description="Receitas, despesas e transferências da família."
        actions={newTransaction}
      />
      <TransactionFiltersBar
        state={state}
        today={today()}
        accounts={accounts.map((a) => ({
          value: a.id,
          label: a.isActive ? a.name : `${a.name} (arquivada)`,
        }))}
        categories={categoryOptions}
        members={overview.members.map((m) => ({
          value: m.memberId,
          label: m.displayName,
        }))}
      />
      {body}
    </div>
  );
}
