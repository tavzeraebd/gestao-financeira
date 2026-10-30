import { PlusIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { InfoHint } from "@/components/shared/info-hint";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountCard } from "@/modules/accounts/components/account-card";
import { getAccountsOverview } from "@/modules/accounts/queries";
import { can } from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Contas" };

export default async function AccountsPage() {
  const [membership, overview] = await Promise.all([
    requireMembership(),
    getAccountsOverview(),
  ]);
  const canManage = can(membership.role, "account.manage");
  const active = overview.accounts.filter((a) => a.isActive);
  const archived = overview.accounts.filter((a) => !a.isActive);
  const hasCard = overview.accounts.some((a) => a.type === "credit_card");

  const newAccount = canManage ? (
    <Link href="/contas/nova" className={buttonVariants()}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      Nova conta
    </Link>
  ) : undefined;

  if (overview.accounts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Contas"
          description="Onde o dinheiro da família está."
        />
        <EmptyState
          icon={WalletIcon}
          title="Nenhuma conta cadastrada"
          description={
            canManage
              ? "Cadastre a primeira conta, com o saldo de hoje, para começar a registrar lançamentos."
              : "Peça a quem administra a família para cadastrar as contas."
          }
          action={newAccount}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas"
        description="Onde o dinheiro da família está."
        actions={newAccount}
      />

      <section
        aria-label="Resumo das contas"
        className="grid gap-4 sm:grid-cols-2"
      >
        <Card className="[--card-spacing:--spacing(5)]">
          <CardContent>
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              Saldo total
              <InfoHint label="saldo total">
                Soma das contas, sem cartões de crédito
              </InfoHint>
            </p>
            <p className="text-2xl font-bold" data-testid="saldo-total">
              <Money cents={overview.consolidatedBalance} />
            </p>
          </CardContent>
        </Card>
        {hasCard ? (
          <Card className="[--card-spacing:--spacing(5)]">
            <CardContent>
              <p className="text-muted-foreground flex items-center gap-1 text-sm">
                Faturas em aberto
                <InfoHint label="faturas em aberto">
                  Quanto você deve nos cartões de crédito
                </InfoHint>
              </p>
              <p className="text-2xl font-bold" data-testid="faturas-em-aberto">
                <Money cents={overview.openCardDebt} />
              </p>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <Tabs defaultValue="ativas">
        <TabsList className="group-data-horizontal/tabs:h-12">
          <TabsTrigger value="ativas" className="px-4">
            Ativas ({active.length})
          </TabsTrigger>
          <TabsTrigger value="arquivadas" className="px-4">
            Arquivadas ({archived.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ativas" className="pt-2">
          {active.length === 0 ? (
            <EmptyState
              icon={WalletIcon}
              title="Nenhuma conta ativa"
              description="Reative uma conta arquivada ou cadastre uma nova."
              action={newAccount}
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {active.map((account) => (
                <li key={account.id} className="min-w-0">
                  <AccountCard account={account} canManage={canManage} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="arquivadas" className="pt-2">
          {archived.length === 0 ? (
            <EmptyState
              icon={WalletIcon}
              title="Nenhuma conta arquivada"
              description="As contas que você arquivar aparecem aqui e podem ser reativadas."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {archived.map((account) => (
                <li key={account.id} className="min-w-0">
                  <AccountCard account={account} canManage={canManage} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
