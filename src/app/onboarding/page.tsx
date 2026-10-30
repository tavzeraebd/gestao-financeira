import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";

import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent } from "@/components/ui/card";
import { CreateFamilyForm } from "@/modules/family/components/create-family-form";

export const metadata: Metadata = { title: "Crie sua família" };

export default function OnboardingPage() {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">
            Passo 1 de 1
          </p>
          <div className="flex items-center gap-1">
            <h1 className="text-xl font-bold">Crie sua família</h1>
            <InfoHint label="criar a família">
              A família é o espaço em que vocês vão organizar o dinheiro juntos.
            </InfoHint>
          </div>
        </div>
        <CreateFamilyForm />
        <p className="text-muted-foreground flex items-center gap-1 text-sm">
          <LinkIcon aria-hidden="true" className="size-4 shrink-0" />
          Recebeu um convite?
          <InfoHint label="receber um convite">
            Não precisa criar uma família: abra o link do convite que você
            recebeu e aceite por lá.
          </InfoHint>
        </p>
      </CardContent>
    </Card>
  );
}
