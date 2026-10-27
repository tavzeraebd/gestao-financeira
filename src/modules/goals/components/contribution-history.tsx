"use client";

import { ArrowDownLeftIcon, ArrowUpRightIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Money } from "@/components/shared/money";
import { ResponsiveList } from "@/components/shared/responsive-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatDateBR } from "@/lib/dates";
import { deleteContribution } from "@/modules/goals/actions";
import {
  CONTRIBUTION_KIND_LABELS,
  type ContributionKind,
} from "@/modules/goals/constants";
import type { ContributionView } from "@/modules/goals/types";
import { goalErrorMessage } from "./goal-error-message";

const KIND_ICON = {
  deposit: ArrowDownLeftIcon,
  withdrawal: ArrowUpRightIcon,
} as const;

function KindBadge({ kind }: { kind: ContributionKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <Badge variant={kind === "deposit" ? "success" : "outline"}>
      <Icon aria-hidden="true" />
      {CONTRIBUTION_KIND_LABELS[kind]}
    </Badge>
  );
}

function DeleteContributionButton({ item }: { item: ContributionView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = CONTRIBUTION_KIND_LABELS[item.kind].toLowerCase();

  const run = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await safeAction(() =>
        deleteContribution({ contributionId: item.id }),
      );
      if (result.ok) {
        toast.success("Registro excluído");
        setOpen(false);
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      toast.error(goalErrorMessage(result.error));
      setOpen(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            disabled={!hydrated}
            aria-label={`Excluir ${label} de ${formatDateBR(item.date)}`}
          />
        }
      >
        <Trash2Icon aria-hidden="true" data-icon="inline-start" />
        Excluir
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
          <AlertDialogDescription>
            O {label} de {formatDateBR(item.date)} deixa de contar no valor
            guardado da meta.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Manter registro</AlertDialogCancel>
          <AlertDialogAction loading={pending} onClick={run}>
            Excluir registro
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const direction = (kind: ContributionKind) =>
  kind === "deposit" ? "in" : "out";

/** Só exibe o que a query devolveu; nenhum total é calculado aqui. */
export function ContributionHistory({ items }: { items: ContributionView[] }) {
  return (
    <ResponsiveList
      items={items}
      getKey={(i) => i.id}
      caption="Histórico de aportes e retiradas"
      columns={[
        { id: "date", header: "Data", cell: (i) => formatDateBR(i.date) },
        { id: "member", header: "Integrante", cell: (i) => i.member.displayName },
        { id: "kind", header: "Tipo", cell: (i) => <KindBadge kind={i.kind} /> },
        {
          id: "amount",
          header: "Valor",
          align: "end",
          cell: (i) => (
            <Money cents={i.amount} direction={direction(i.kind)} />
          ),
        },
        {
          id: "notes",
          header: "Observação",
          cell: (i) => i.notes ?? "—",
        },
        {
          id: "actions",
          header: "Ações",
          align: "end",
          cell: (i) => (i.canDelete ? <DeleteContributionButton item={i} /> : null),
        },
      ]}
      renderCard={(i) => (
        <div
          className="flex flex-col gap-2"
          data-testid="aporte"
        >
          <div className="flex items-center justify-between gap-2">
            <KindBadge kind={i.kind} />
            <Money
              cents={i.amount}
              direction={direction(i.kind)}
              className="font-semibold"
            />
          </div>
          <p className="text-sm">
            {formatDateBR(i.date)} · {i.member.displayName}
          </p>
          {i.notes ? (
            <p className="text-muted-foreground text-sm">{i.notes}</p>
          ) : null}
          {i.canDelete ? (
            <div>
              <DeleteContributionButton item={i} />
            </div>
          ) : null}
        </div>
      )}
    />
  );
}
