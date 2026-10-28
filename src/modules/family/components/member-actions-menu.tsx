"use client";

import {
  CrownIcon,
  EllipsisVerticalIcon,
  ShieldCheckIcon,
  ShieldMinusIcon,
  UserMinusIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import {
  changeMemberRole,
  removeMember,
  transferOwnership,
} from "@/modules/family/actions";
import { memberErrorMessage } from "@/modules/family/domain/member-error-message";
import type { MemberActions } from "@/modules/family/permissions";
import type { ActionResult } from "@/server/action";

type MemberActionsMenuProps = {
  memberId: string;
  displayName: string;
  /** Só UX: o que o menu mostra. A autorização real é das RPCs. */
  actions: MemberActions;
};

type Confirm = "transfer" | "remove";

export function hasMemberActions(actions: MemberActions): boolean {
  return (
    actions.makeAdmin ||
    actions.makeMember ||
    actions.transferOwnership ||
    actions.remove
  );
}

/** Menu de ações sobre um integrante. Só aparecem as ações permitidas; sem nenhuma, não renderiza. */
export function MemberActionsMenu({
  memberId,
  displayName,
  actions,
}: MemberActionsMenuProps) {
  const router = useRouter();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  if (!hasMemberActions(actions)) return null;

  const run = (
    call: () => Promise<ActionResult<null>>,
    successMessage: string,
  ) => {
    startTransition(async () => {
      const result = await safeAction(call);
      if (result.ok) {
        toast.success(successMessage);
      } else if (!sessionExpired(result.error)) {
        toast.error(memberErrorMessage(result.error));
        // Integrante que já saiu: recarrega a lista para refletir o estado atual.
        if (result.error.code === "NOT_FOUND") router.refresh();
      }
      setConfirm(null);
    });
  };

  const setRole = (role: "admin" | "member") =>
    run(
      () => changeMemberRole({ memberId, role }),
      role === "admin"
        ? `${displayName} agora é administrador.`
        : `${displayName} agora é integrante.`,
    );

  const confirmCopy =
    confirm === "transfer"
      ? {
          title: `Transferir a propriedade para ${displayName}?`,
          description: `Você passa a ser administrador. ${displayName} passa a ser o proprietário e pode alterar o seu papel.`,
          action: "Transferir propriedade",
          cancel: "Cancelar",
        }
      : {
          title: `Remover ${displayName} da família?`,
          description: `${displayName} perde o acesso aos dados da família na hora. O que foi registrado por ${displayName} continua na família. Convites criados por ${displayName} são revogados.`,
          action: "Remover da família",
          cancel: "Manter na família",
        };

  const onConfirm = () =>
    confirm === "transfer"
      ? run(
          () => transferOwnership({ memberId }),
          `${displayName} é o novo proprietário da família.`,
        )
      : run(
          () => removeMember({ memberId }),
          `${displayName} foi removido da família.`,
        );

  const hasOtherItems =
    actions.makeAdmin || actions.makeMember || actions.transferOwnership;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Ações para ${displayName}`}
            />
          }
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {actions.makeAdmin ? (
            <DropdownMenuItem
              className="min-h-10"
              onClick={() => setRole("admin")}
            >
              <ShieldCheckIcon aria-hidden="true" />
              Tornar administrador
            </DropdownMenuItem>
          ) : null}
          {actions.makeMember ? (
            <DropdownMenuItem
              className="min-h-10"
              onClick={() => setRole("member")}
            >
              <ShieldMinusIcon aria-hidden="true" />
              Tornar integrante
            </DropdownMenuItem>
          ) : null}
          {actions.transferOwnership ? (
            <DropdownMenuItem
              className="min-h-10"
              onClick={() => setConfirm("transfer")}
            >
              <CrownIcon aria-hidden="true" />
              Transferir propriedade
            </DropdownMenuItem>
          ) : null}
          {actions.remove && hasOtherItems ? <DropdownMenuSeparator /> : null}
          {actions.remove ? (
            <DropdownMenuItem
              variant="destructive"
              className="min-h-10"
              onClick={() => setConfirm("remove")}
            >
              <UserMinusIcon aria-hidden="true" />
              Remover da família
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next && !pending) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {confirmCopy.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={pending}
              onClick={onConfirm}
            >
              {confirmCopy.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
