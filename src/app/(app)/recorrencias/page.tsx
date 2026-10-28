import { PlusIcon, RepeatIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SubNav } from "@/components/shared/sub-nav";
import { buttonVariants } from "@/components/ui/button";
import { today } from "@/lib/dates";
import {
  RECURRENCE_SITUATIONS,
  type RecurrenceSituation,
} from "@/modules/recurrences/constants";
import { RecurrenceCard } from "@/modules/recurrences/components/recurrence-card";
import { SituationTabs } from "@/modules/recurrences/components/situation-tabs";
import { listRecurrences } from "@/modules/recurrences/queries";
import { recurrenceFiltersSchema } from "@/modules/recurrences/schemas";

export const metadata: Metadata = { title: "Recorrências" };

const SITUATION_LABELS: Record<RecurrenceSituation, string> = {
  ativas: "Ativas",
  pausadas: "Pausadas",
  encerradas: "Encerradas",
};

const EMPTY_TEXT: Record<RecurrenceSituation, string> = {
  ativas:
    "Crie um compromisso com “Repetir” ligado para gerar as ocorrências automaticamente.",
  pausadas: "As séries que você pausar aparecem aqui e podem ser reativadas.",
  encerradas: "As séries que você encerrar aparecem aqui.",
};

const EMPTY_TITLE: Record<RecurrenceSituation, string> = {
  ativas: "Nenhuma recorrência",
  pausadas: "Nenhuma recorrência pausada",
  encerradas: "Nenhuma recorrência encerrada",
};

const SUB_NAV = [
  { href: "/transacoes", label: "Lançamentos" },
  { href: "/compromissos", label: "Compromissos" },
  { href: "/recorrencias", label: "Recorrências" },
];

export default async function RecurrencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = recurrenceFiltersSchema.parse(await searchParams);
  const items = await listRecurrences(filters);

  return (
    <div className="flex flex-col gap-6">
      <SubNav
        items={SUB_NAV}
        aria-label="Lançamentos, compromissos e recorrências"
      />
      <PageHeader
        title="Recorrências"
        description="Contas que se repetem: o app cria as próximas ocorrências sozinho."
        actions={
          <Link href="/compromissos/novo" className={buttonVariants()}>
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            Novo compromisso
          </Link>
        }
      />
      <SituationTabs
        aria-label="Situação das recorrências"
        items={RECURRENCE_SITUATIONS.map((s) => ({
          href:
            s === "ativas" ? "/recorrencias" : `/recorrencias?situacao=${s}`,
          label: SITUATION_LABELS[s],
          active: filters.situacao === s,
        }))}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title={EMPTY_TITLE[filters.situacao]}
          description={EMPTY_TEXT[filters.situacao]}
          action={
            filters.situacao === "ativas" ? (
              <Link href="/compromissos/novo" className={buttonVariants()}>
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                Novo compromisso
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map((recurrence) => (
            <li key={recurrence.id} className="min-w-0">
              <RecurrenceCard recurrence={recurrence} today={today()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
