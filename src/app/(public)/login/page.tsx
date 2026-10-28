import { AlertCircleIcon, ClockIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { SignInForm } from "@/modules/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Entrar" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const erro = first(params.erro);
  const motivo = first(params.motivo);
  const next = first(params.next);
  // Só o valor conhecido mostra o aviso; qualquer outro é ignorado.
  const contaExcluida = first(params.conta) === "excluida";

  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">Entrar</h1>
          <p className="text-muted-foreground text-sm">
            Acesse sua conta para ver as finanças da família.
          </p>
        </div>
        {erro === "link_invalido" ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertDescription>
              O link é inválido ou expirou. Solicite um novo.
            </AlertDescription>
          </Alert>
        ) : null}
        {motivo === "sessao_expirada" ? (
          <Alert variant="warning">
            <ClockIcon aria-hidden="true" />
            <AlertDescription>
              Sua sessão expirou. Entre novamente para continuar.
            </AlertDescription>
          </Alert>
        ) : null}
        {contaExcluida ? (
          <Alert>
            <InfoIcon aria-hidden="true" />
            <AlertDescription>
              Sua conta foi excluída. Para usar o app de novo, crie uma conta
              nova.
            </AlertDescription>
          </Alert>
        ) : null}
        <SignInForm next={next} />
      </CardContent>
    </Card>
  );
}
