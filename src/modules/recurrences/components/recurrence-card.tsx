import {
  CalendarClockIcon,
  ListIcon,
  PencilIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR, type ISODate } from "@/lib/dates";
import { BILL_KIND_LABELS } from "@/modules/bills/constants";
import type { RecurrenceView } from "@/modules/recurrences/types";
import { EndRecurrenceDialog } from "./end-recurrence-dialog";
import { PauseResumeButton } from "./recurrence-status-buttons";

export function RecurrenceCard({
  recurrence: r,
  today,
}: {
  recurrence: RecurrenceView;
  today: ISODate;
}) {
  const ended = r.state === "ended";
  const paused = r.state === "paused";
  return (
    <Card className="[--card-spacing:--spacing(5)]" data-testid="recorrencia">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CategoryIcon icon={r.category.icon} color={r.category.color} />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">
                {r.description}
              </h2>
              <p className="text-muted-foreground truncate text-sm">
                {r.category.name} · {r.account.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Money
              cents={r.amount}
              direction={r.kind === "pagar" ? "out" : "in"}
              className="text-base font-semibold"
            />
            <Badge variant="outline">{BILL_KIND_LABELS[r.kind]}</Badge>
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Repetição:</dt>
            <dd>{r.label}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Próxima:</dt>
            <dd>
              {r.nextOccurrence ? formatDateBR(r.nextOccurrence) : "Nenhuma"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Término:</dt>
            <dd>
              {r.endDate
                ? `Termina em ${formatDateBR(r.endDate)}`
                : "Sem término"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Responsável:</dt>
            <dd>{r.assignedMember?.displayName ?? "Sem responsável"}</dd>
          </div>
        </dl>

        {paused ? (
          <Badge variant="secondary" className="self-start">
            <CalendarClockIcon aria-hidden="true" />
            Pausada
          </Badge>
        ) : null}
        {ended ? (
          <Badge variant="outline" className="self-start">
            Encerrada
          </Badge>
        ) : null}

        {r.attention ? (
          <Alert variant="warning">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Precisa de atenção</AlertTitle>
            <AlertDescription>
              <p>{r.attention.message}</p>
              {r.canManage ? (
                <Link
                  href={`/recorrencias/${r.id}/editar`}
                  className="text-primary-text mt-1 inline-block font-medium underline underline-offset-4"
                >
                  Editar série
                </Link>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Link
            href={`/compromissos?serie=${r.id}&situacao=abertos`}
            aria-label={`Ver ocorrências de ${r.description}`}
            title="Ocorrências"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "w-11 px-0",
            })}
          >
            <ListIcon aria-hidden="true" data-icon="inline-start" />
          </Link>
          {r.canManage ? (
            <>
              <Link
                href={`/recorrencias/${r.id}/editar`}
                className={buttonVariants({
                  variant: "warning",
                  size: "lg",
                  className: "w-11 px-0",
                })}
                aria-label={`Editar série ${r.description}`}
                title="Editar"
              >
                <PencilIcon aria-hidden="true" data-icon="inline-start" />
              </Link>
              {ended ? null : (
                <>
                  <PauseResumeButton
                    recurrenceId={r.id}
                    description={r.description}
                    paused={paused}
                  />
                  <EndRecurrenceDialog
                    recurrenceId={r.id}
                    description={r.description}
                    startDate={r.startDate}
                    today={today}
                  />
                </>
              )}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
