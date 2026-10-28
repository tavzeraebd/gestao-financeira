import Link from "next/link";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { LazyHorizontalBarChart } from "@/components/charts/lazy";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS } from "@/modules/accounts/constants";
import type { AccountReport } from "@/modules/reports/types";

export const ACCOUNT_TRANSFER_NOTE =
  "Transferências entre contas aparecem aqui. No saldo total elas se anulam.";

type ReportAccountsProps = {
  report: AccountReport;
  /** Owner/admin recebem o atalho para cadastrar a primeira conta. */
  canManageAccounts: boolean;
};

export function ReportAccounts({
  report,
  canManageAccounts,
}: ReportAccountsProps) {
  const { accounts, consolidated, period } = report;
  const summary = accounts
    .map((a) => `${a.name}: líquido ${formatBRL(a.net)}`)
    .join("; ");

  return (
    <div className="flex flex-col gap-6">
      <ChartCard
        title="Líquido por conta"
        period={period.label}
        isEmpty={accounts.length === 0}
        empty={{
          title: "Nenhuma conta com movimento",
          description: canManageAccounts
            ? "Cadastre uma conta para acompanhar entradas e saídas de cada uma."
            : "Peça a quem administra a família para cadastrar as contas.",
          action: canManageAccounts ? (
            <Link href="/contas/nova" className={buttonVariants()}>
              Nova conta
            </Link>
          ) : undefined,
        }}
        table={{
          caption: `Líquido por conta em ${period.label}`,
          columns: [
            { id: "conta", header: "Conta" },
            { id: "liquido", header: "Líquido (entradas − saídas)", align: "end" },
          ],
          rows: accounts.map((a) => ({
            key: a.id,
            cells: [a.name, formatBRL(a.net)],
          })),
        }}
        legend={
          <ChartLegend
            aria-label="Legenda: líquido por conta"
            items={[
              {
                key: "positivo",
                label: "Entradas maiores que saídas",
                color: "chart-income",
              },
              {
                key: "negativo",
                label: "Saídas maiores que entradas",
                color: "chart-expense",
              },
            ]}
          />
        }
      >
        <LazyHorizontalBarChart
          data={accounts.map((a) => ({
            key: a.id,
            label: a.archived ? `${a.name} (arquivada)` : a.name,
            value: a.net,
            color: a.net < 0 ? "chart-expense" : "chart-income",
          }))}
          ariaLabel={`Líquido por conta em ${period.label}. ${summary}.`}
        />
      </ChartCard>

      {accounts.length > 0 ? (
        <section aria-labelledby="contas-detalhe" className="flex flex-col gap-3">
          <h2 id="contas-detalhe" className="text-base font-semibold">
            Entradas e saídas por conta
          </h2>
          <Table>
            <TableCaption className="sr-only">
              Saldo inicial, entradas, saídas e saldo final de cada conta em{" "}
              {period.label}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Conta</TableHead>
                <TableHead scope="col" className="text-right">
                  Saldo inicial
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Entradas
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Saídas
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Saldo final
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} data-testid="linha-conta">
                  <TableCell>
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="break-words font-medium">{a.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {ACCOUNT_TYPE_LABELS[a.type]}
                      </span>
                      {a.archived ? (
                        <Badge variant="outline">Arquivada</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={a.opening} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={a.inflow} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={a.outflow} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={a.closing} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow data-testid="variacao-saldo-total">
                <TableCell colSpan={4} className="font-semibold">
                  Variação do saldo total
                  <span className="text-muted-foreground block text-xs font-normal">
                    Contas de ativo; cartões de crédito ficam de fora.
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <Money
                    cents={consolidated.delta}
                    direction={
                      consolidated.delta > 0
                        ? "in"
                        : consolidated.delta < 0
                          ? "out"
                          : "neutral"
                    }
                  />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-muted-foreground text-xs">
            {consolidated.percent === null
              ? "Sem base de comparação: o saldo no início do período era zero."
              : `${formatPercent(consolidated.percent, { signDisplay: "exceptZero" })} sobre o saldo no início do período.`}
          </p>
        </section>
      ) : null}

      <p
        className="text-muted-foreground text-sm"
        data-testid="nota-transferencias"
      >
        {ACCOUNT_TRANSFER_NOTE}
      </p>
    </div>
  );
}
