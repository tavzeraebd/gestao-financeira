import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeleteAccountDialog } from "@/modules/profile/components/delete-account-dialog";
import type { AccountDeletionPreview } from "@/modules/profile/types";

function Consequences({ preview }: { preview: AccountDeletionPreview }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
      {preview.willEraseFamily ? (
        <li>
          <strong>Você é a única pessoa da família.</strong> A família inteira e
          todos os dados dela serão apagados de forma definitiva: contas,
          lançamentos, categorias, orçamentos, metas, parcelas, acertos,
          convites e histórico de atividade.
        </li>
      ) : preview.role === null ? (
        <li>Você não faz parte de nenhuma família.</li>
      ) : (
        <>
          <li>Você sai da família e perde o acesso aos dados dela.</li>
          <li>
            O que você registrou (lançamentos, metas e aportes) continua com a
            família.
          </li>
          <li>Os convites pendentes que você criou são revogados.</li>
        </>
      )}
      <li>
        Seu perfil é anonimizado: o nome passa a ser “Conta excluída” e a foto é
        removida.
      </li>
      <li>Suas notificações e a atividade de segurança são apagadas.</li>
      <li>
        Você sai do app e não consegue mais entrar com esta conta. O e-mail fica
        livre para criar uma conta nova, sem vínculo com esta.
      </li>
      <li>
        <strong>A exclusão é imediata e não pode ser desfeita.</strong>
      </li>
    </ul>
  );
}

function ownerBlockedText(others: number): string {
  return others === 1
    ? "Você é a pessoa proprietária da família e há mais 1 integrante nela."
    : `Você é a pessoa proprietária da família e há mais ${others} integrantes nela.`;
}

/** Zona de perigo de /configuracoes (ADR-0038). Os textos derivam só da prévia do servidor. */
export function DeleteAccountSection({
  preview,
}: {
  preview: AccountDeletionPreview;
}) {
  const ownerBlocked =
    preview.hasPassword && preview.role === "owner" && !preview.canDelete;

  return (
    <Card
      role="region"
      aria-labelledby="excluir-conta-titulo"
      className="ring-danger [--card-spacing:--spacing(5)]"
    >
      <CardHeader>
        <CardTitle
          id="excluir-conta-titulo"
          role="heading"
          aria-level={2}
          className="text-destructive text-lg"
        >
          Excluir conta
        </CardTitle>
        <CardDescription>
          Apague sua conta e seus dados pessoais. Esta ação é permanente.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!preview.hasPassword ? (
          <Alert variant="warning">
            <AlertTriangleIcon aria-hidden="true" />
            <AlertDescription>
              Não é possível excluir a conta por aqui: ela não usa senha para
              entrar, e a exclusão exige confirmar a senha. Fale com o suporte
              para pedir a exclusão.
            </AlertDescription>
          </Alert>
        ) : ownerBlocked ? (
          <>
            <Alert variant="warning">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertDescription>
                <p>{ownerBlockedText(preview.otherActiveMembers)}</p>
                <p>
                  Transfira a propriedade antes de excluir sua conta. Depois,
                  volte aqui para concluir.
                </p>
              </AlertDescription>
            </Alert>
            <div>
              <Link
                href="/familia"
                className={buttonVariants({ variant: "outline" })}
              >
                Ir para Família
              </Link>
            </div>
          </>
        ) : (
          <>
            <Consequences preview={preview} />
            <div>
              <DeleteAccountDialog willEraseFamily={preview.willEraseFamily} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
