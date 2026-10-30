import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { toBRLInput } from "@/lib/money";
import { BILL_KIND_TO_TYPE } from "@/modules/bills/constants";
import { listAccountOptions } from "@/modules/accounts/queries";
import { listCategoryOptions } from "@/modules/categories/queries";
import { getFamilyOverview } from "@/modules/family/queries";
import { RecurrenceForm } from "@/modules/recurrences/components/recurrence-form";
import { getRecurrence } from "@/modules/recurrences/queries";

export const metadata: Metadata = { title: "Editar recorrência" };

export default async function EditRecurrencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recurrence = await getRecurrence(id);
  if (!recurrence || !recurrence.canManage) notFound();

  const [overview, allAccounts, categories] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
    listCategoryOptions(BILL_KIND_TO_TYPE[recurrence.kind]),
  ]);

  const accounts = allAccounts
    .filter((a) => a.isActive || a.id === recurrence.account.id)
    .map((a) => ({
      id: a.id,
      name: a.isActive ? a.name : `${a.name} (arquivada)`,
    }));
  const withCurrent = categories.some((c) => c.id === recurrence.category.id)
    ? categories
    : [
        ...categories,
        {
          id: recurrence.category.id,
          name: `${recurrence.category.name} (arquivada)`,
          parentId: null,
          color: recurrence.category.color,
          icon: recurrence.category.icon,
        },
      ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/recorrencias"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Recorrências
      </Link>
      <h1 className="text-xl font-bold">Editar recorrência</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <RecurrenceForm
            today={today()}
            recurrenceId={recurrence.id}
            kind={recurrence.kind}
            scheduleLabel={recurrence.label}
            startDate={recurrence.startDate}
            accounts={accounts}
            categories={withCurrent}
            members={overview.members.map((m) => ({
              id: m.memberId,
              displayName: m.displayName,
            }))}
            initial={{
              description: recurrence.description,
              amount: toBRLInput(recurrence.amount),
              categoryId: recurrence.category.id,
              accountId: recurrence.account.id,
              assignedMemberId: recurrence.assignedMember?.id ?? "",
              endDate: recurrence.endDate ?? "",
              payrollDeduction: recurrence.payrollDeduction,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
