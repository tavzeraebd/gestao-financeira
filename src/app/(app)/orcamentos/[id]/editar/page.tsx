import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { toBRLInput } from "@/lib/money";
import { BudgetForm } from "@/modules/budgets/components/budget-form";
import { getBudget } from "@/modules/budgets/queries";
import { listCategoryOptions } from "@/modules/categories/queries";
import { can } from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Editar orçamento" };

export default async function EditBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const membership = await requireMembership();
  if (!can(membership.role, "budget.manage")) notFound();
  const budget = await getBudget(id);
  if (!budget) notFound();

  const active = await listCategoryOptions("expense");
  const categories =
    budget.categoryId &&
    !active.some((c) => c.id === budget.categoryId)
      ? [
          ...active,
          {
            id: budget.categoryId,
            name: `${budget.categoryName ?? "Categoria"} (arquivada)`,
            parentId: null,
            color: "chart-1" as const,
            icon: "ellipsis" as const,
          },
        ]
      : active;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/orcamentos"
        className={buttonVariants({ variant: "ghost", className: "self-start" })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Orçamentos
      </Link>
      <h1 className="text-xl font-bold">Editar orçamento</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <BudgetForm
            mode="edit"
            budgetId={budget.id}
            today={today()}
            categories={categories}
            initial={{
              categoryId: budget.categoryId ?? "",
              amountLimit: toBRLInput(budget.amountLimit),
              startMonth: budget.startMonth.slice(0, 7),
              endMonth: budget.endMonth?.slice(0, 7) ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
