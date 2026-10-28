import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { BudgetForm } from "@/modules/budgets/components/budget-form";
import { listCategoryOptions } from "@/modules/categories/queries";
import { can } from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NewBudgetPage() {
  const membership = await requireMembership();
  if (!can(membership.role, "budget.manage")) notFound();
  const categories = await listCategoryOptions("expense");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/orcamentos"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Orçamentos
      </Link>
      <h1 className="text-xl font-bold">Novo orçamento</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <BudgetForm mode="create" today={today()} categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
