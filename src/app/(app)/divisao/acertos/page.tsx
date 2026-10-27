import { ArrowRightIcon, HandshakeIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { buttonVariants } from "@/components/ui/button";
import { formatDateBR } from "@/lib/dates";
import { DeleteSettlementButton } from "@/modules/splits/components/delete-settlement-button";
import { listSettlements } from "@/modules/splits/queries";
import type { SettlementView } from "@/modules/splits/types";

export const metadata: Metadata = { title: "Acertos" };

function Direction({ item }: { item: SettlementView }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{item.from.displayName}</span>
      <ArrowRightIcon aria-label="para" className="size-4" role="img" />
      <span>{item.to.displayName}</span>
    </span>
  );
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).pagina;
  const requested = z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .catch(1)
    .parse(Array.isArray(raw) ? raw[0] : raw);
  const page = await listSettlements({ page: requested });

  const hrefFor = (target: number) =>
    target > 1 ? `/divisao/acertos?pagina=${target}` : "/divisao/acertos";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/divisao"
        className={buttonVariants({ variant: "ghost", className: "self-start" })}
      >
        Divisão de contas
      </Link>
      <PageHeader
        title="Acertos"
        description="Pagamentos entre integrantes. Não alteram contas nem o saldo total."
        actions={
          <Link href="/divisao/acertos/novo" className={buttonVariants()}>
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            Registrar acerto
          </Link>
        }
      />
      {page.items.length > 0 ? (
        <>
          <ResponsiveList
            items={page.items}
            getKey={(item) => item.id}
            caption="Acertos entre integrantes"
            columns={[
              {
                id: "data",
                header: "Data",
                className: "whitespace-nowrap",
                cell: (item) => (
                  <span className="tabular-nums">{formatDateBR(item.date)}</span>
                ),
              },
              {
                id: "partes",
                header: "De → Para",
                cell: (item) => <Direction item={item} />,
              },
              {
                id: "observacao",
                header: "Observação",
                cell: (item) =>
                  item.notes ?? (
                    <span className="text-muted-foreground">Sem observação</span>
                  ),
              },
              {
                id: "valor",
                header: "Valor",
                align: "end",
                cell: (item) => <Money cents={item.amount} />,
              },
              {
                id: "acoes",
                header: "Ações",
                align: "end",
                cell: (item) =>
                  item.canDelete ? (
                    <DeleteSettlementButton settlementId={item.id} />
                  ) : null,
              },
            ]}
            renderCard={(item) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <Direction item={item} />
                  <Money cents={item.amount} className="font-semibold" />
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatDateBR(item.date)}
                  {item.notes ? ` · ${item.notes}` : ""}
                </div>
                {item.canDelete ? (
                  <div>
                    <DeleteSettlementButton settlementId={item.id} />
                  </div>
                ) : null}
              </div>
            )}
          />
          <div className="flex justify-center">
            <PaginationNav
              page={page.page}
              pageCount={page.pageCount}
              hrefForPage={hrefFor}
            />
          </div>
        </>
      ) : (
        <EmptyState
          icon={HandshakeIcon}
          title="Nenhum acerto registrado"
          description="Quando um integrante pagar o que deve a outro, registre o acerto para o saldo refletir."
          action={
            <Link href="/divisao/acertos/novo" className={buttonVariants()}>
              Registrar acerto
            </Link>
          }
        />
      )}
    </div>
  );
}
