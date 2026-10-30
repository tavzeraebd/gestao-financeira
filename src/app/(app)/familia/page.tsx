import { HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { InfoHint } from "@/components/shared/info-hint";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateInviteForm } from "@/modules/family/components/create-invite-form";
import {
  ROLE_LABELS,
  formatDateTime,
} from "@/modules/family/components/invite-labels";
import { LeaveFamilyButton } from "@/modules/family/components/leave-family-button";
import { MemberActionsMenu } from "@/modules/family/components/member-actions-menu";
import { RenameFamilyDialog } from "@/modules/family/components/rename-family-dialog";
import { RevokeInviteButton } from "@/modules/family/components/revoke-invite-button";
import { roleLabel } from "@/modules/family/domain/role-labels";
import { can } from "@/modules/family/permissions";
import {
  getFamilyOverview,
  listPendingInvites,
} from "@/modules/family/queries";

export const metadata: Metadata = { title: "Família" };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

const ROLE_BADGE = {
  owner: "default",
  admin: "secondary",
  member: "outline",
} as const;

export default async function FamilyPage() {
  const [overview, invites] = await Promise.all([
    getFamilyOverview(),
    listPendingInvites(),
  ]);
  const { family, myRole, members, memberCount, permissions } = overview;
  const canManageInvites = can(myRole, "invite.list");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Família"
        description="Quem participa e como convidar novas pessoas."
        actions={
          permissions.canRename || permissions.canViewActivity ? (
            <>
              {permissions.canRename ? (
                <RenameFamilyDialog currentName={family.name} />
              ) : null}
              {permissions.canViewActivity ? (
                <Link
                  href="/familia/atividade"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <HistoryIcon aria-hidden="true" data-icon="inline-start" />
                  Ver atividade
                </Link>
              ) : null}
            </>
          ) : undefined
        }
      />

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-lg">{family.name}</CardTitle>
          <CardDescription>
            {memberCount === 1 ? "1 membro" : `${memberCount} membros`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h2 className="mb-2 text-sm font-semibold">Membros</h2>
          <ul className="flex flex-col divide-y">
            {members.map((member) => (
              <li
                key={member.memberId}
                className="flex min-h-14 items-center gap-3 py-2"
              >
                <Avatar size="lg">
                  {member.avatarUrl ? (
                    <AvatarImage src={member.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {initialsOf(member.displayName)}
                  </AvatarFallback>
                </Avatar>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.displayName}
                  {member.isMe ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (você)
                    </span>
                  ) : null}
                </p>
                <Badge variant={ROLE_BADGE[member.role]}>
                  {roleLabel(member.role)}
                </Badge>
                <MemberActionsMenu
                  memberId={member.memberId}
                  displayName={member.displayName}
                  actions={member.actions}
                />
              </li>
            ))}
          </ul>
          {permissions.canLeave ? (
            <div className="mt-4 border-t pt-4">
              <LeaveFamilyButton />
            </div>
          ) : myRole === "owner" ? (
            <p className="text-muted-foreground mt-4 border-t pt-4 text-sm">
              Para sair, transfira a propriedade antes.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canManageInvites ? (
        <>
          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-lg">
                Convidar alguém
                <InfoHint label="convidar alguém">
                  Gere um link e envie para a pessoa. Cada link vale para um
                  único uso.
                </InfoHint>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CreateInviteForm
                canCreateAdmin={can(myRole, "invite.create_admin")}
              />
            </CardContent>
          </Card>

          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-lg">
                Convites pendentes
                <InfoHint label="convites pendentes">
                  Convites que ainda não foram aceitos nem expiraram.
                </InfoHint>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <p className="text-muted-foreground flex items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm">
                  Nenhum convite pendente.
                  <InfoHint label="convites pendentes vazios">
                    Gere um link acima para convidar alguém.
                  </InfoHint>
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {invites.map((invite) => {
                    const canRevoke =
                      can(myRole, "invite.revoke_any") ||
                      (invite.role === "member" &&
                        can(myRole, "invite.revoke_member_invite"));
                    const who = invite.invitedEmail ?? "qualquer e-mail";
                    return (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{who}</p>
                          <p className="text-muted-foreground text-xs">
                            Válido até {formatDateTime(invite.expiresAt)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            invite.role === "admin" ? "secondary" : "outline"
                          }
                        >
                          {ROLE_LABELS[invite.role]}
                        </Badge>
                        {canRevoke ? (
                          <RevokeInviteButton
                            inviteId={invite.id}
                            label={`convite para ${who}`}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
