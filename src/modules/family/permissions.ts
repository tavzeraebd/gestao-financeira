export type FamilyRole = "owner" | "admin" | "member";

export type FamilyAction =
  | "invite.list"
  | "invite.create_member"
  | "invite.create_admin"
  | "invite.revoke_member_invite"
  | "invite.revoke_any"
  | "audit.read"
  | "account.manage"
  | "category.manage"
  | "transaction.manage_any"
  | "budget.manage"
  | "goal.manage"
  | "settlement.register";

const ALLOWED: Record<FamilyAction, readonly FamilyRole[]> = {
  "invite.list": ["owner", "admin"],
  "invite.create_member": ["owner", "admin"],
  "invite.create_admin": ["owner"],
  "invite.revoke_member_invite": ["owner", "admin"],
  "invite.revoke_any": ["owner"],
  "audit.read": ["owner", "admin"],
  "account.manage": ["owner", "admin"],
  "category.manage": ["owner", "admin"],
  "transaction.manage_any": ["owner", "admin"],
  "budget.manage": ["owner", "admin"],
  "goal.manage": ["owner", "admin"],
  "settlement.register": ["owner", "admin"],
};

/** Só UX (mostrar/ocultar). A autorização real é do banco (RLS + RPCs). */
export function can(role: FamilyRole, action: FamilyAction): boolean {
  return ALLOWED[action].includes(role);
}

/** Só UX: owner/admin gerenciam qualquer lançamento; member, apenas os que criou. */
export function canManageTransaction(
  role: FamilyRole,
  createdBy: string,
  userId: string,
): boolean {
  return can(role, "transaction.manage_any") || createdBy === userId;
}

/** Só UX: owner/admin, quem criou ou o responsável (vínculo do usuário) marcam o compromisso como pago. */
export function canPayBill(
  role: FamilyRole,
  createdBy: string,
  assignedUserId: string | null,
  userId: string,
): boolean {
  return (
    can(role, "transaction.manage_any") ||
    createdBy === userId ||
    (assignedUserId !== null && assignedUserId === userId)
  );
}

/** Só UX: owner/admin registram aporte para qualquer integrante; member, só para si. */
export function canContributeFor(
  role: FamilyRole,
  myMemberId: string,
  memberId: string,
): boolean {
  return can(role, "goal.manage") || myMemberId === memberId;
}

/** Só UX: owner/admin excluem qualquer aporte; member, só os que registrou. */
export function canDeleteContribution(
  role: FamilyRole,
  createdBy: string,
  userId: string,
): boolean {
  return canManageTransaction(role, createdBy, userId);
}

/** Só UX: mesma regra de `canManageTransaction` (dono do lançamento ou owner/admin). */
export function canSetSplits(
  role: FamilyRole,
  createdBy: string,
  userId: string,
): boolean {
  return canManageTransaction(role, createdBy, userId);
}

/** Só UX: owner/admin ou uma das partes do acerto. */
export function canRegisterSettlement(
  role: FamilyRole,
  myMemberId: string,
  fromId: string,
  toId: string,
): boolean {
  return (
    can(role, "goal.manage") || myMemberId === fromId || myMemberId === toId
  );
}
