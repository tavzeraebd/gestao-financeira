import { ChevronLeftIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { listAccountOptions } from "@/modules/accounts/queries";
import { BillForm } from "@/modules/bills/components/bill-form";
import { listCategoryOptions } from "@/modules/categories/queries";
import { can } from "@/modules/family/permissions";
import { getFamilyOverview } from "@/modules/family/queries";

export const metadata: Metadata = { title: "Novo compromisso" };

export default async function NewBillPage() {
  const [overview, allAccounts, income, expense] = await Promise.all([
    getFamilyOverview(),
    listAccountOptions(),
    listCategoryOptions("income"),
    listCategoryOptions("expense"),
  ]);
  const accounts = allAccounts.filter((account) => account.isActive);
  const canManageAccounts = can(overview.myRole, "account.manage");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/compromissos"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Compromissos
      </Link>
      <h1 className="text-xl font-bold">Novo compromisso</h1>
      {accounts.length === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title="Cadastre uma conta primeiro"
          description={
            canManageAccounts
              ? "Todo compromisso fica dentro de uma conta ou cartão. Cadastre a primeira para continuar."
              : "Todo compromisso fica dentro de uma conta ou cartão. Peça a quem administra a família para cadastrar as contas."
          }
          action={
            canManageAccounts ? (
              <Link href="/contas/nova" className={buttonVariants()}>
                Cadastrar conta
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="[--card-spacing:--spacing(5)]">
          <CardContent>
            <BillForm
              mode="create"
              today={today()}
              accounts={accounts}
              categories={{ income, expense }}
              members={overview.members.map((m) => ({
                id: m.memberId,
                displayName: m.displayName,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
