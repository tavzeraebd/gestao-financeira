import type { Metadata } from "next";

import { InfoHint } from "@/components/shared/info-hint";
import { PageHeader } from "@/components/shared/page-header";
import { getMyProfile } from "@/modules/profile/queries";
import { CommitmentDetailProvider } from "@/modules/reports/components/commitment-detail-provider";
import { CommitmentByCategoryCard } from "@/modules/reports/components/commitment-by-category-card";
import { CommitmentHorizonFilter } from "@/modules/reports/components/commitment-horizon-filter";
import { CommitmentMonthlyCard } from "@/modules/reports/components/commitment-monthly-card";
import { CommitmentSummaryCards } from "@/modules/reports/components/commitment-summary-cards";
import { UpcomingBillsCard } from "@/modules/reports/components/upcoming-bills-card";
import { getCommitmentDashboard } from "@/modules/reports/queries";
import { commitmentFiltersSchema } from "@/modules/reports/schemas";

export const metadata: Metadata = { title: "Início" };

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Acompanhamento do comprometimento futuro da família: só leitura, sem atalhos de criação. */
export default async function HomePage({ searchParams }: HomePageProps) {
  // Filtros da URL sempre passam pelo schema (tolerante); nunca crus.
  const filters = commitmentFiltersSchema.parse(await searchParams);
  const [profile, dashboard] = await Promise.all([
    getMyProfile(),
    getCommitmentDashboard(filters),
  ]);
  const firstName = profile.displayName.trim().split(/\s+/)[0] ?? "";
  const { overview } = dashboard;

  return (
    <CommitmentDetailProvider details={dashboard.details}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`Olá, ${firstName}!`}
          description="Acompanhe o que a sua família já tem de compromissos daqui para frente."
          actions={<CommitmentHorizonFilter horizon={overview.horizon} />}
        />
        <p className="text-muted-foreground -mt-3 flex items-center gap-1 text-sm">
          <span>
            Período: <span data-testid="periodo-atual">{overview.label}</span>
          </span>
          <InfoHint label="como os valores são calculados">
            Comprometido é a soma das contas a pagar em aberto (vencidas entram
            no mês atual) com as despesas recorrentes que ainda não foram
            lançadas. A receita esperada soma as contas a receber em aberto e as
            receitas recorrentes futuras. Pagamentos já feitos e séries pausadas
            ficam de fora. O saldo atual soma as contas (sem cartões) com o que
            já foi realizado; o saldo projetado de cada mês é o saldo atual mais
            a receita esperada acumulada, menos o comprometido acumulado. Toque
            ou clique em um valor, mês, fatia ou categoria para ver, operação
            por operação, de onde vem o número. O histórico está em Relatórios.
          </InfoHint>
          <InfoHint label="desconto em folha">
            Desconto em folha (parcelas descontadas direto do salário) entra no
            comprometido e no percentual da receita, mas não reduz o saldo
            projetado: o salário é lançado já líquido, então esse valor nunca
            sai das contas. Por isso o percentual pode ficar um pouco acima do
            real.
          </InfoHint>
        </p>

        <CommitmentSummaryCards
          overview={overview}
          balance={dashboard.balance}
          projection={dashboard.projection}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 *:data-[slot=card]:h-full lg:col-span-2">
            <CommitmentMonthlyCard
              overview={overview}
              projection={dashboard.projection}
            />
          </div>
          <div className="min-w-0 *:data-[slot=card]:h-full">
            <CommitmentByCategoryCard
              breakdown={dashboard.byCategory}
              periodLabel={overview.label}
            />
          </div>
          <div className="min-w-0 lg:col-span-3">
            <UpcomingBillsCard items={dashboard.upcomingBills} />
          </div>
        </div>
      </div>
    </CommitmentDetailProvider>
  );
}
