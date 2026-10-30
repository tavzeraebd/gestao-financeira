import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/dates";
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

type Navigate = (view: DetailView) => void;

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
              <span>{originText(item)}</span>
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
          <p className="text-muted-foreground mt-2 text-xs">
            O desconto em folha entra no comprometido, mas não sai do saldo: o
            salário é lançado já líquido.
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
            <h3 id="saldo-faturas" className="text-sm font-semibold">
              Faturas de cartão em aberto
            </h3>
            <span className="text-sm font-semibold tabular-nums">
              <Money cents={details.openCardDebt} />
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Cartões não entram no saldo atual.
          </p>
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

function MonthButton({
  month,
  onNavigate,
  children,
}: {
  month: MonthDetail;
  onNavigate: Navigate;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`Ver detalhes de ${month.longLabel}`}
      onClick={() => onNavigate({ kind: "month", month: month.month })}
      className="focus-visible:ring-ring hover:bg-muted flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-3"
    >
      {children}
      <ChevronRightIcon
        aria-hidden="true"
        className="text-muted-foreground size-4 shrink-0"
      />
    </button>
  );
}

function TotalBody({
  details,
  onNavigate,
}: {
  details: CommitmentDetails;
  onNavigate: Navigate;
}) {
  return (
    <ul className="flex flex-col divide-y" data-testid="detalhe-total">
      {details.months.map((m) => (
        <li key={m.month}>
          <MonthButton month={m} onNavigate={onNavigate}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{m.longLabel}</span>
              <span className="text-muted-foreground text-xs">
                Contas <Money cents={m.pending} /> · Recorrências{" "}
                <Money cents={m.recurring} /> · Folha{" "}
                <Money cents={m.payroll} />
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              <Money cents={m.committed} />
            </span>
          </MonthButton>
        </li>
      ))}
    </ul>
  );
}

function LowestBody({
  details,
  onNavigate,
}: {
  details: CommitmentDetails;
  onNavigate: Navigate;
}) {
  const index = details.months.findIndex(
    (m) => m.month === details.lowestMonth,
  );
  if (index < 0) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Sem meses no período.
      </p>
    );
  }
  const steps = details.months.slice(0, index + 1);
  const lowest = details.months[index];
  return (
    <div className="flex flex-col gap-5" data-testid="detalhe-menor-saldo">
      <section aria-labelledby="menor-saldo-conta">
        <h3 id="menor-saldo-conta" className="mb-1 text-sm font-semibold">
          Como se chega ao menor saldo
        </h3>
        <p className="text-muted-foreground mb-2 text-xs">
          Cada mês parte do saldo do mês anterior, soma a receita esperada e
          subtrai o que sai do caixa (contas em aberto e recorrências).
        </p>
        <div className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2">
          <span className="text-sm">Saldo atual</span>
          <span className="text-sm font-semibold tabular-nums">
            <Money cents={details.currentBalance} />
          </span>
        </div>
        <ul className="mt-2 flex flex-col divide-y rounded-lg border">
          {steps.map((m) => (
            <li key={m.month}>
              <MonthButton month={m} onNavigate={onNavigate}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{m.longLabel}</span>
                  <span className="text-muted-foreground text-xs">
                    Receita <Money cents={m.income} direction="in" /> · Sai do
                    caixa <Money cents={m.cashCommitted} direction="out" />
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  <Money cents={m.closing} />
                  {m.negative ? " (negativo)" : ""}
                </span>
              </MonthButton>
            </li>
          ))}
        </ul>
      </section>
      {lowest ? (
        <section
          aria-labelledby="menor-saldo-mes"
          className="flex flex-col gap-3"
        >
          <h3 id="menor-saldo-mes" className="text-sm font-semibold">
            Detalhes de {lowest.longLabel}
          </h3>
          <MonthBody month={lowest} />
        </section>
      ) : null}
    </div>
  );
}

/** Conteúdo do diálogo para a visão aberta; tudo vem pronto de `details` (nenhuma consulta). */
export function CommitmentDetailBody({
  details,
  view,
  onNavigate,
}: {
  details: CommitmentDetails;
  view: DetailView;
  onNavigate: Navigate;
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
    case "total":
      return <TotalBody details={details} onNavigate={onNavigate} />;
    case "lowest":
      return <LowestBody details={details} onNavigate={onNavigate} />;
  }
}
