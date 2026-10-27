import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";

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
          <h1 className="text-xl font-bold">Crie sua família</h1>
          <p className="text-muted-foreground text-sm">
            A família é o espaço em que vocês vão organizar o dinheiro juntos.
          </p>
        </div>
        <CreateFamilyForm />
        <div className="bg-muted text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-sm">
          <LinkIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            Recebeu um convite? Não precisa criar uma família: abra o link do
            convite que você recebeu e aceite por lá.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
