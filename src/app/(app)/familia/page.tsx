import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { RevokeInviteButton } from "@/modules/family/components/revoke-invite-button";
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
  const { family, myRole, members } = overview;
  const canManageInvites = can(myRole, "invite.list");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Família"
        description="Quem participa e como convidar novas pessoas."
      />

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-lg">{family.name}</CardTitle>
          <CardDescription>
            {members.length === 1
              ? "1 integrante"
              : `${members.length} integrantes`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h2 className="mb-2 text-sm font-semibold">Integrantes</h2>
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
                  {ROLE_LABELS[member.role]}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManageInvites ? (
        <>
          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="text-lg">Convidar alguém</CardTitle>
              <CardDescription>
                Gere um link e envie para a pessoa. Cada link vale para um único
                uso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateInviteForm
                canCreateAdmin={can(myRole, "invite.create_admin")}
              />
            </CardContent>
          </Card>

          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="text-lg">Convites pendentes</CardTitle>
              <CardDescription>
                Convites que ainda não foram aceitos nem expiraram.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                  Nenhum convite pendente. Gere um link acima para convidar
                  alguém.
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
