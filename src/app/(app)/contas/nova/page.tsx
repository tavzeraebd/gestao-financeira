import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { AccountForm } from "@/modules/accounts/components/account-form";
import { can } from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Nova conta" };

export default async function NewAccountPage() {
  const membership = await requireMembership();
  if (!can(membership.role, "account.manage")) notFound();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/contas"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Contas
      </Link>
      <h1 className="text-xl font-bold">Nova conta</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <AccountForm mode="create" today={today()} />
        </CardContent>
      </Card>
    </div>
  );
}
