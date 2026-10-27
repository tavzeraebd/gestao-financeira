import { InfoIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PLANNING_DISCLAIMER } from "@/modules/planning/constants";
import { PlanningSimulator } from "@/modules/planning/components/planning-simulator";
import { getPlanningBaseline } from "@/modules/planning/queries";

export const metadata: Metadata = { title: "Planejamento" };

export default async function PlanningPage() {
  const baseline = await getPlanningBaseline();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Planejamento"
        description="Simule cenários com os dados da família e com valores que você informa."
      />
      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>{PLANNING_DISCLAIMER}</AlertDescription>
      </Alert>
      <PlanningSimulator baseline={baseline} />
    </div>
  );
}
