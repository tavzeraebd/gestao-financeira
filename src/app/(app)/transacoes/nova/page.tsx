import { ChevronLeftIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { listAccountOptions } from "@/modules/accounts/queries";
import { listCategoryOptions } from "@/modules/categories/queries";
import { can } from "@/modules/family/permissions";
import { getFamilyOverview } from "@/modules/family/queries";
import { TransactionForm } from "@/modules/transactions/components/transaction-form";
import type { TransactionType } from "@/modules/transactions/constants";

export const metadata: Metadata = { title: "Nova transação" };

const TYPE_FROM_URL = new Map<string, TransactionType>([
  ["despesa", "expense"],
  ["receita", "income"],
  ["transferencia", "transfer"],
]);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [overview, allAccounts, income, expense] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
    listCategoryOptions("income"),
    listCategoryOptions("expense"),
  ]);
  const accounts = allAccounts.filter((account) => account.isActive);
  const type = TYPE_FROM_URL.get(first(params.tipo) ?? "") ?? "expense";
  const accountParam = first(params.conta);
  const accountId = accounts.some((a) => a.id === accountParam)
    ? (accountParam ?? "")
    : "";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/transacoes"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Transações
      </Link>
      <h1 className="text-xl font-bold">Nova transação</h1>
      {accounts.length === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title="Cadastre uma conta primeiro"
          description={
            can(overview.myRole, "account.manage")
              ? "Todo lançamento fica dentro de uma conta ou cartão. Cadastre a primeira para continuar."
              : "Todo lançamento fica dentro de uma conta ou cartão. Peça a quem administra a família para cadastrar as contas."
          }
          action={
            can(overview.myRole, "account.manage") ? (
              <Link href="/contas/nova" className={buttonVariants()}>
                Cadastrar conta
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="[--card-spacing:--spacing(5)]">
          <CardContent>
            <TransactionForm
              mode="create"
              today={today()}
              accounts={accounts}
              categories={{ income, expense }}
              members={overview.members.map((m) => ({
                id: m.memberId,
                displayName: m.displayName,
              }))}
              initial={{ type, accountId }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
