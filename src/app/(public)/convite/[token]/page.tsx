import {
  AlertCircleIcon,
  ClockIcon,
  MailPlusIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AcceptInviteButton } from "@/modules/family/components/accept-invite-button";
import {
  ROLE_LABELS,
  formatDateTime,
} from "@/modules/family/components/invite-labels";
import { getInvitePreview } from "@/modules/family/queries";
import { getOptionalMembership } from "@/server/auth";

export const metadata: Metadata = {
  title: "Convite para a família",
  robots: { index: false, follow: false },
};

function StatusCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-5 text-center">
        <div className="bg-primary-soft-strong text-primary-text mx-auto flex size-12 items-center justify-center rounded-full">
          {icon}
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">{title}</h1>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getInvitePreview(token);

  if (!preview.ok && preview.code === "UNAUTHENTICATED") {
    const next = /^[0-9a-f]{64}$/.test(token)
      ? `?next=${encodeURIComponent(`/convite/${token}`)}`
      : "";
    return (
      <StatusCard
        icon={<MailPlusIcon aria-hidden="true" className="size-6" />}
        title="Você foi convidado para uma família no Núcleo"
      >
        <p className="text-muted-foreground text-sm">
          Entre na sua conta ou crie uma nova para ver os detalhes e aceitar o
          convite.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href={`/login${next}`}
            className={buttonVariants({ size: "lg" })}
          >
            Entrar
          </Link>
          <Link
            href={`/cadastro${next}`}
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Criar conta
          </Link>
        </div>
      </StatusCard>
    );
  }

  const backToStart = (
    <Link
      href="/inicio"
      className={buttonVariants({ variant: "outline", className: "mt-3" })}
    >
      Ir para o início
    </Link>
  );

  if (!preview.ok) {
    return (
      <StatusCard
        icon={<AlertCircleIcon aria-hidden="true" className="size-6" />}
        title="Convite não encontrado"
      >
        <p className="text-muted-foreground text-sm">
          Confira o link ou peça um novo convite a quem administra a família.
        </p>
        {backToStart}
      </StatusCard>
    );
  }

  const { familyName, role, expiresAt, status, emailBound } = preview.data;

  if (status === "accepted") {
    return (
      <StatusCard
        icon={<AlertCircleIcon aria-hidden="true" className="size-6" />}
        title="Este convite já foi utilizado"
      >
        <p className="text-muted-foreground text-sm">
          Peça um novo convite a quem administra a família {familyName}.
        </p>
        {backToStart}
      </StatusCard>
    );
  }

  if (status === "revoked") {
    return (
      <StatusCard
        icon={<AlertCircleIcon aria-hidden="true" className="size-6" />}
        title="Este convite foi revogado"
      >
        <p className="text-muted-foreground text-sm">
          Peça um novo convite a quem administra a família {familyName}.
        </p>
        {backToStart}
      </StatusCard>
    );
  }

  if (status === "expired") {
    return (
      <StatusCard
        icon={<ClockIcon aria-hidden="true" className="size-6" />}
        title="Este convite expirou"
      >
        <p className="text-muted-foreground text-sm">
          A validade terminou em {formatDateTime(expiresAt)}. Peça um novo
          convite a quem administra a família {familyName}.
        </p>
        {backToStart}
      </StatusCard>
    );
  }

  const membership = await getOptionalMembership();
  if (membership) {
    return (
      <StatusCard
        icon={<UsersIcon aria-hidden="true" className="size-6" />}
        title="Você já faz parte de uma família"
      >
        <p className="text-muted-foreground text-sm">
          Neste momento cada pessoa participa de uma única família. Para usar
          este convite, é preciso ter saído da atual.
        </p>
        {backToStart}
      </StatusCard>
    );
  }

  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="bg-primary-soft-strong text-primary-text flex size-12 items-center justify-center rounded-full">
            <UsersIcon aria-hidden="true" className="size-6" />
          </div>
          <h1 className="text-xl font-bold">Convite para a família</h1>
          <p className="text-muted-foreground text-sm">
            Você foi convidado para participar de:
          </p>
          <p className="text-lg font-semibold break-words">{familyName}</p>
        </div>
        <dl className="bg-muted flex flex-col gap-2 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Seu papel</dt>
            <dd>
              <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Válido até</dt>
            <dd className="font-medium">{formatDateTime(expiresAt)}</dd>
          </div>
        </dl>
        {emailBound ? (
          <Alert>
            <MailPlusIcon aria-hidden="true" />
            <AlertDescription>
              Este convite foi emitido para um e-mail específico. Use a conta
              desse e-mail para aceitar.
            </AlertDescription>
          </Alert>
        ) : null}
        <AcceptInviteButton token={token} />
      </CardContent>
    </Card>
  );
}
