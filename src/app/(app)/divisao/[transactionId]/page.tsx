import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InfoHint } from "@/components/shared/info-hint";
import { Money } from "@/components/shared/money";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import { SplitForm } from "@/modules/splits/components/split-form";
import { getTransactionSplit } from "@/modules/splits/queries";

export const metadata: Metadata = { title: "Dividir despesa" };

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-muted-foreground text-sm sm:w-40 sm:shrink-0">
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function SplitDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const detail = await getTransactionSplit(transactionId);
  if (!detail || !detail.splittable) notFound();
  const { transaction } = detail;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        href="/divisao"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Divisão de contas
      </Link>

      <header>
        <h1 className="text-xl font-bold break-words">
          Dividir: {transaction.description}
        </h1>
      </header>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <dl className="divide-y">
            <Row label="Valor">
              <Money cents={transaction.amount} direction="out" />
            </Row>
            <Row label="Data">{formatDateBR(transaction.date, "long")}</Row>
            <Row label="Situação">
              {transaction.isPending ? "Pendente" : "Pago"}
            </Row>
            <Row label="Responsável">
              {transaction.payer?.displayName ?? "Sem responsável"}
            </Row>
          </dl>
        </CardContent>
      </Card>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-1 text-base">
            Divisão
            <InfoHint label="divisão">
              A divisão só registra quanto cabe a cada um. A despesa continua
              contando uma vez no saldo e nos totais.
            </InfoHint>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.canEdit ? (
            <SplitForm detail={detail} />
          ) : detail.parts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Esta despesa ainda não foi dividida. Só quem registrou a despesa
              ou quem administra a família pode dividi-la.
            </p>
          ) : (
            <ul className="divide-y">
              {detail.parts.map((part) => (
                <li
                  key={part.member.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span>{part.member.displayName}</span>
                  <Money cents={part.amount} className="font-medium" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
