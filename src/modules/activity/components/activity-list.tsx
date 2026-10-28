import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { ResponsiveList } from "@/components/shared/responsive-list";
import type { ActivityItem } from "@/modules/activity/types";

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** Data e hora no fuso de Brasília; igual no servidor e no navegador. */
export function formatActivityDate(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

function ResourceLink({ item }: { item: ActivityItem }) {
  if (!item.href) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={item.href}
      aria-label={`Abrir: ${item.title}`}
      className="text-primary-text focus-visible:ring-ring inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
    >
      Abrir
      <ArrowUpRightIcon aria-hidden="true" className="size-4" />
    </Link>
  );
}

/** Tabela a partir de `md`, cartões no celular. Sem metadata crua: o texto vem pronto do servidor. */
export function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <ResponsiveList
      items={items}
      getKey={(item) => item.id}
      caption="Atividade da família"
      columns={[
        {
          id: "quando",
          header: "Data e hora",
          cell: (item) => (
            <time
              dateTime={item.createdAt}
              className="text-muted-foreground tabular-nums"
            >
              {formatActivityDate(item.createdAt)}
            </time>
          ),
          className: "whitespace-nowrap",
        },
        { id: "quem", header: "Quem", cell: (item) => item.actor },
        {
          id: "o-que",
          header: "O quê",
          cell: (item) => <span className="font-medium">{item.title}</span>,
        },
        {
          id: "detalhe",
          header: "Detalhe",
          cell: (item) =>
            item.detail ?? <span className="text-muted-foreground">—</span>,
          className: "whitespace-normal",
        },
        {
          id: "link",
          header: "Recurso",
          cell: (item) => <ResourceLink item={item} />,
        },
      ]}
      renderCard={(item) => (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{item.title}</p>
          {item.detail ? (
            <p className="text-muted-foreground text-sm">{item.detail}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {item.actor} ·{" "}
            <time dateTime={item.createdAt} className="tabular-nums">
              {formatActivityDate(item.createdAt)}
            </time>
          </p>
          {item.href ? <ResourceLink item={item} /> : null}
        </div>
      )}
    />
  );
}
