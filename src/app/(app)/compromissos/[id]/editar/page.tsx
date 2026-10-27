import { ChevronLeftIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { toBRLInput } from "@/lib/money";
import { listAccountOptions } from "@/modules/accounts/queries";
import { BillForm } from "@/modules/bills/components/bill-form";
import { getBill } from "@/modules/bills/queries";
import { listCategoryOptions } from "@/modules/categories/queries";
import { getFamilyOverview } from "@/modules/family/queries";

export const metadata: Metadata = { title: "Editar compromisso" };

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bill = await getBill(id);
  if (
    !bill ||
    !bill.canEdit ||
    bill.status === "paid" ||
    bill.status === "canceled"
  ) {
    notFound();
  }

  const [overview, allAccounts, income, expense] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
    listCategoryOptions("income"),
    listCategoryOptions("expense"),
  ]);

  const accounts = allAccounts
    .filter((a) => a.isActive || a.id === bill.account.id)
    .map((a) => ({
      id: a.id,
      name: a.isActive ? a.name : `${a.name} (arquivada)`,
    }));

  const list = bill.kind === "receber" ? income : expense;
  const withCurrent = list.some((c) => c.id === bill.category.id)
    ? list
    : [
        ...list,
        {
          id: bill.category.id,
          name: `${bill.category.name} (arquivada)`,
          parentId: null,
          color: bill.category.color,
          icon: bill.category.icon,
        },
      ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href={`/compromissos/${bill.id}`}
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Compromisso
      </Link>
      <h1 className="text-xl font-bold">Editar compromisso</h1>
      {bill.recurrence ? (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>
            Esta alteração vale só para esta ocorrência. Para mudar as próximas,{" "}
            <Link
              href={`/recorrencias/${bill.recurrence.id}/editar`}
              className="text-primary-text underline"
            >
              edite a série
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <BillForm
            mode="edit"
            transactionId={bill.id}
            today={today()}
            accounts={accounts}
            categories={{
              income: bill.kind === "receber" ? withCurrent : income,
              expense: bill.kind === "pagar" ? withCurrent : expense,
            }}
            members={overview.members.map((m) => ({
              id: m.memberId,
              displayName: m.displayName,
            }))}
            initial={{
              kind: bill.kind,
              description: bill.description,
              categoryId: bill.category.id,
              amount: toBRLInput(bill.amount),
              dueDate: bill.dueDate,
              accountId: bill.account.id,
              assignedMemberId: bill.assignedMember?.id ?? "",
              notes: bill.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
