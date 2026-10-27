import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  ListIcon,
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  SmartphoneIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { asCents, negCents } from "@/lib/money";
import { AccountStatusButton } from "@/modules/accounts/components/account-status-button";
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from "@/modules/accounts/constants";
import type { AccountView } from "@/modules/accounts/types";

const TYPE_ICONS: Record<AccountType, LucideIcon> = {
  checking: LandmarkIcon,
  savings: PiggyBankIcon,
  cash: BanknoteIcon,
  credit_card: CreditCardIcon,
  digital_wallet: SmartphoneIcon,
  investment: TrendingUpIcon,
  other: WalletIcon,
};

const ACTION = buttonVariants({ variant: "outline" });

export function AccountCard({
  account,
  canManage,
}: {
  account: AccountView;
  canManage: boolean;
}) {
  const Icon = TYPE_ICONS[account.type];
  const isCard = account.type === "credit_card";
  const debt = account.balance < 0 ? negCents(account.balance) : asCents(0);

  return (
    <Card className="[--card-spacing:--spacing(5)]" data-testid="conta">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary-soft-strong text-primary-text flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold break-words">
              {account.name}
            </h3>
            <p className="text-muted-foreground text-sm">
              {ACCOUNT_TYPE_LABELS[account.type]}
              {account.institutionName ? ` · ${account.institutionName}` : ""}
            </p>
          </div>
          {account.isActive ? null : <Badge variant="outline">Arquivada</Badge>}
        </div>

        {isCard ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">
                {account.balance > 0 ? "Crédito a favor" : "Dívida"}
              </dt>
              <dd className="text-lg font-semibold">
                <Money cents={account.balance > 0 ? account.balance : debt} />
              </dd>
            </div>
            {account.availableCredit !== null ? (
              <div>
                <dt className="text-muted-foreground">Limite disponível</dt>
                <dd className="text-lg font-semibold">
                  <Money cents={account.availableCredit} />
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <div className="text-sm">
            <p className="text-muted-foreground">Saldo</p>
            <p className="text-lg font-semibold">
              <Money cents={account.balance} />
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href={`/transacoes?conta=${account.id}`} className={ACTION}>
            <ListIcon aria-hidden="true" data-icon="inline-start" />
            Ver movimentações
          </Link>
          {account.isActive ? (
            <>
              <Link
                href={`/transacoes/nova?conta=${account.id}`}
                className={ACTION}
              >
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                Nova transação
              </Link>
              <Link
                href={`/transacoes/nova?tipo=transferencia&conta=${account.id}`}
                className={ACTION}
              >
                <ArrowLeftRightIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                />
                Transferir
              </Link>
            </>
          ) : null}
          {canManage ? (
            <>
              <Link
                href={`/contas/${account.id}/editar`}
                className={ACTION}
                aria-label={`Editar ${account.name}`}
              >
                <PencilIcon aria-hidden="true" data-icon="inline-start" />
                Editar
              </Link>
              <AccountStatusButton
                accountId={account.id}
                name={account.name}
                isActive={account.isActive}
              />
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
