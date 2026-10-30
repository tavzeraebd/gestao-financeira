import Link from "next/link";
import { CreditCardIcon } from "lucide-react";
import type { ReactNode } from "react";

import { InfoHint } from "@/components/shared/info-hint";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { formatDateBR, type ISODate } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { negCents } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS } from "@/modules/accounts/constants";
import { commitmentItemHref } from "@/modules/reports/domain/commitment-details";
import type {
  CategoryDetail,
  CommitmentDetailItem,
  CommitmentDetails,
  CommitmentItemGroup,
  MonthDetail,
} from "@/modules/reports/types";

import type { DetailView } from "./commitment-detail-views";

const GROUP_TITLES: Record<CommitmentItemGroup, string> = {
  bills: "Contas em aberto",
  recurring: "Recorrências",
  payroll: "Desconto em folha",
  income: "Receitas esperadas",
};

const GROUP_ORDER: CommitmentItemGroup[] = [
  "bills",
  "recurring",
  "payroll",
  "income",
];

function originText(item: CommitmentDetailItem): string {
  if (item.origin === "series") return "Recorrência";
  return item.type === "income" ? "Conta a receber" : "Conta a pagar";
}

/** dd/MM a partir do formatador existente (dd/MM/aaaa). */
const shortDay = (d: ISODate) => formatDateBR(d).slice(0, 5);

function OriginLine({ item }: { item: CommitmentDetailItem }) {
  if (!item.cardName && !item.purchaseDate)
    return <span>{originText(item)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <CreditCardIcon aria-hidden="true" className="size-3.5" />
      {[
        item.cardName ?? "Cartão",
        item.purchaseDate ? `Compra ${shortDay(item.purchaseDate)}` : null,
        `Fatura vence ${shortDay(item.date)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ItemList({ items }: { items: CommitmentDetailItem[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-start justify-between gap-3 py-2"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={commitmentItemHref(item.origin, item.sourceId)}
              className="focus-visible:ring-ring -my-1 inline-flex min-h-10 items-center rounded-md py-1 text-sm font-medium break-words underline-offset-2 outline-none hover:underline focus-visible:ring-3"
            >
              {item.description}
            </Link>
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="tabular-nums">{formatDateBR(item.date)}</span>
              <span>{item.categoryName}</span>
              <OriginLine item={item} />
              {item.group === "payroll" ? (
                <Badge variant="secondary">Folha</Badge>
              ) : null}
              {item.overdue ? <Badge variant="danger">Vencida</Badge> : null}
            </span>
          </div>
          <Money
            cents={item.amount}
            direction={item.type === "income" ? "in" : "out"}
            className="pt-2 text-sm font-semibold"
          />
        </li>
      ))}
    </ul>
  );
}

function ItemGroup({
  title,
  items,
  total,
  headingId,
}: {
  title: string;
  items: CommitmentDetailItem[];
  total: ReactNode;
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold">
          {title}{" "}
          <span className="text-muted-foreground font-normal">
            ({items.length})
          </span>
        </h3>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </div>
      <ItemList items={items} />
    </section>
  );
}

function MonthBody({ month }: { month: MonthDetail }) {
  const { groups } = month;
  const totals: Record<CommitmentItemGroup, MonthDetail["pending"]> = {
    bills: month.pending,
    recurring: month.recurring,
    payroll: month.payroll,
    income: month.income,
  };
  const hasExpenses =
    groups.bills.length + groups.recurring.length + groups.payroll.length > 0;
  return (
    <div className="flex flex-col gap-5" data-testid="detalhe-mes">
      <dl className="divide-y rounded-lg border px-3">
        <Row label="Contas em aberto">
          <Money cents={month.pending} />
        </Row>
        <Row label="Recorrências">
          <Money cents={month.recurring} />
        </Row>
        <Row label="Desconto em folha">
          <Money cents={month.payroll} />
        </Row>
        <Row label="Comprometido">
          <Money cents={month.committed} />
        </Row>
        <Row label="Receita esperada">
          <Money cents={month.income} />
        </Row>
        <Row label="% da receita comprometida">
          {month.percent === null
            ? "Sem receita esperada"
            : formatPercent(month.percent)}
        </Row>
        <Row label="Saldo projetado ao fim do mês">
          <Money cents={month.closing} />
          {month.negative ? " (negativo)" : ""}
        </Row>
      </dl>

      <section aria-labelledby={`conta-${month.month}`}>
        <h3 id={`conta-${month.month}`} className="mb-1 text-sm font-semibold">
          Como se chega ao saldo projetado
        </h3>
        <dl className="divide-y rounded-lg border px-3">
          <Row label="Saldo no início do mês">
            <Money cents={month.opening} />
          </Row>
          <Row label="Mais a receita esperada">
            <Money cents={month.income} direction="in" />
          </Row>
          <Row label="Menos contas em aberto">
            <Money cents={month.pending} direction="out" />
          </Row>
          <Row label="Menos recorrências">
            <Money cents={month.recurring} direction="out" />
          </Row>
          <Row label="Saldo ao fim do mês">
            <Money cents={month.closing} />
            {month.negative ? " (negativo)" : ""}
          </Row>
        </dl>
        {month.payroll > 0 ? (
          <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
            Desconto em folha
            <InfoHint label="desconto em folha">
              O desconto em folha entra no comprometido, mas não sai do saldo: o
              salário é lançado já líquido.
            </InfoHint>
          </p>
        ) : null}
      </section>

      {!hasExpenses ? (
        <p className="text-muted-foreground text-sm" role="status">
          Nada comprometido neste mês.
        </p>
      ) : null}
      {GROUP_ORDER.map((group) =>
        groups[group].length > 0 ? (
          <ItemGroup
            key={group}
            headingId={`grupo-${group}-${month.month}`}
            title={GROUP_TITLES[group]}
            items={groups[group]}
            total={<Money cents={totals[group]} />}
          />
        ) : null,
      )}
    </div>
  );
}

function CategoryBody({ category }: { category: CategoryDetail }) {
  return (
    <div className="flex flex-col gap-5" data-testid="detalhe-categoria">
      <dl className="divide-y rounded-lg border px-3">
        <Row label="Total comprometido na categoria">
          <Money cents={category.total} />
        </Row>
        <Row label="Participação no total">
          {formatPercent(category.percent)}
        </Row>
      </dl>
      {category.months.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          Nenhum item comprometido nesta categoria.
        </p>
      ) : (
        category.months.map((m) => (
          <ItemGroup
            key={m.month}
            headingId={`categoria-${category.key}-${m.month}`}
            title={m.longLabel}
            items={m.items}
            total={<Money cents={m.total} />}
          />
        ))
      )}
    </div>
  );
}

function AccountsBody({ details }: { details: CommitmentDetails }) {
  const assets = details.accounts.filter((a) => a.type !== "credit_card");
  const cards = details.accounts.filter((a) => a.type === "credit_card");
  if (details.accounts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Nenhuma conta com saldo para mostrar.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-testid="detalhe-saldo">
      <section aria-labelledby="saldo-contas" className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="saldo-contas" className="text-sm font-semibold">
            Contas
          </h3>
          <span className="text-sm font-semibold tabular-nums">
            <Money cents={details.currentBalance} />
          </span>
        </div>
        <ul className="flex flex-col divide-y">
          {assets.map((a) => (
            <li
              key={a.id}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">
                  {a.name}
                  {a.archived ? " (arquivada)" : ""}
                </span>
                <span className="text-muted-foreground text-xs">
                  {ACCOUNT_TYPE_LABELS[a.type]}
                </span>
              </span>
              <Money cents={a.balance} className="text-sm font-semibold" />
            </li>
          ))}
        </ul>
      </section>
      {cards.length > 0 ? (
        <section
          aria-labelledby="saldo-faturas"
          className="flex flex-col gap-1"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3
              id="saldo-faturas"
              className="flex items-center gap-1 text-sm font-semibold"
            >
              Faturas de cartão em aberto
              <InfoHint label="faturas de cartão em aberto">
                Cartões não entram no saldo atual.
              </InfoHint>
            </h3>
            <span className="text-sm font-semibold tabular-nums">
              <Money cents={details.openCardDebt} />
            </span>
          </div>
          <ul className="flex flex-col divide-y">
            {cards.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="text-sm font-medium">
                  {a.name}
                  {a.archived ? " (arquivada)" : ""}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {a.balance < 0 ? (
                    <Money cents={negCents(a.balance)} />
                  ) : (
                    "Sem fatura em aberto"
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Conteúdo do diálogo para a visão aberta; tudo vem pronto de `details` (nenhuma consulta). */
export function CommitmentDetailBody({
  details,
  view,
}: {
  details: CommitmentDetails;
  view: DetailView;
}) {
  switch (view.kind) {
    case "month": {
      const month = details.months.find((m) => m.month === view.month);
      return month ? (
        <MonthBody month={month} />
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          Mês fora do período.
        </p>
      );
    }
    case "category": {
      const category = details.categories.find((c) => c.key === view.key);
      return category ? (
        <CategoryBody category={category} />
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          Categoria fora do período.
        </p>
      );
    }
    case "accounts":
      return <AccountsBody details={details} />;
  }
}
