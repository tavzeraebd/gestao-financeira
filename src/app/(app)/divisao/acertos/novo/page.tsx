import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { today } from "@/lib/dates";
import { can } from "@/modules/family/permissions";
import { getFamilyOverview } from "@/modules/family/queries";
import { SettlementForm } from "@/modules/splits/components/settlement-form";

export const metadata: Metadata = { title: "Registrar acerto" };

export default async function NewSettlementPage() {
  const overview = await getFamilyOverview();
  const me = overview.members.find((m) => m.isMe);
  const members = overview.members.map((m) => ({
    id: m.memberId,
    displayName: m.displayName,
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        href="/divisao/acertos"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Acertos
      </Link>
      <PageHeader title="Registrar acerto" />
      <SettlementForm
        members={members}
        myMemberId={me?.memberId ?? ""}
        canManage={can(overview.myRole, "settlement.register")}
        today={today()}
      />
    </div>
  );
}
