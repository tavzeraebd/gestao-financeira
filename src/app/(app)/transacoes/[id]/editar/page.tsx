import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { toBRLInput } from "@/lib/money";
import { listAccountOptions } from "@/modules/accounts/queries";
import { listCategoryOptions } from "@/modules/categories/queries";
import { getFamilyOverview } from "@/modules/family/queries";
import { TransactionForm } from "@/modules/transactions/components/transaction-form";
import { getTransaction } from "@/modules/transactions/queries";

export const metadata: Metadata = { title: "Editar transação" };

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getTransaction(id);
  if (!detail || !detail.canEdit) notFound();

  const [overview, allAccounts, income, expense] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
    listCategoryOptions("income"),
    listCategoryOptions("expense"),
  ]);

  const accounts = allAccounts
    .filter(
      (a) =>
        a.isActive ||
        a.id === detail.account.id ||
        a.id === detail.destinationAccount?.id,
    )
    .map((a) => ({
      id: a.id,
      name: a.isActive ? a.name : `${a.name} (arquivada)`,
    }));

  const withCurrent = (
    list: typeof income,
    type: "income" | "expense",
  ): typeof income =>
    detail.category &&
    detail.type === type &&
    !list.some((c) => c.id === detail.category?.id)
      ? [
          ...list,
          {
            id: detail.category.id,
            name: `${detail.category.name} (arquivada)`,
            parentId: null,
            color: detail.category.color,
            icon: detail.category.icon,
          },
        ]
      : list;

  const locked = detail.reversals.length > 0 || detail.reversalOfId !== null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href={`/transacoes/${detail.id}`}
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Lançamento
      </Link>
      <h1 className="text-xl font-bold">Editar transação</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <TransactionForm
            mode="edit"
            transactionId={detail.id}
            today={today()}
            accounts={accounts}
            categories={{
              income: withCurrent(income, "income"),
              expense: withCurrent(expense, "expense"),
            }}
            members={overview.members.map((m) => ({
              id: m.memberId,
              displayName: m.displayName,
            }))}
            lockedFinancial={locked}
            initial={{
              type: detail.type,
              description: detail.description,
              categoryId: detail.category?.id ?? "",
              amount: toBRLInput(detail.amount),
              transactionDate: detail.transactionDate,
              accountId: detail.account.id,
              destinationAccountId: detail.destinationAccount?.id ?? "",
              assignedMemberId: detail.assignedMember?.id ?? "",
              notes: detail.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
