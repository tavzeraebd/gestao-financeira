import { ExternalLinkIcon, PencilIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { ISODate } from "@/lib/dates";
import { CancelBillButton } from "@/modules/bills/components/cancel-bill-button";
import { PayBillDialog } from "@/modules/bills/components/pay-bill-dialog";
import type { BillListItem } from "@/modules/bills/types";

type BillActionsProps = {
  bill: Pick<
    BillListItem,
    | "id"
    | "kind"
    | "amount"
    | "account"
    | "status"
    | "canPay"
    | "canEdit"
    | "canCancel"
  >;
  /** Contas ativas para o pagamento. */
  accounts: { id: string; name: string }[];
  today: ISODate;
};

/** Ações do compromisso conforme `can*` e a situação (tudo decidido no servidor). */
export function BillActions({ bill, accounts, today }: BillActionsProps) {
  if (bill.status === "paid") {
    return (
      <Link
        href={`/transacoes/${bill.id}`}
        className={buttonVariants({
          variant: "outline",
          size: "lg",
          className: "w-11 px-0",
        })}
        aria-label="Ver lançamento"
        title="Ver lançamento"
      >
        <ExternalLinkIcon aria-hidden="true" data-icon="inline-start" />
      </Link>
    );
  }
  if (bill.status === "canceled") return null;
  return (
    <>
      {bill.canPay ? (
        <PayBillDialog bill={bill} accounts={accounts} today={today} />
      ) : null}
      {bill.canEdit ? (
        <Link
          href={`/compromissos/${bill.id}/editar`}
          aria-label="Editar compromisso"
          className={buttonVariants({
            variant: "warning",
            size: "lg",
            className: "w-11 px-0",
          })}
          title="Editar"
        >
          <PencilIcon aria-hidden="true" data-icon="inline-start" />
        </Link>
      ) : null}
      {bill.canCancel ? <CancelBillButton transactionId={bill.id} /> : null}
    </>
  );
}
