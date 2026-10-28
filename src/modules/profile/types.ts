import type { FamilyRole } from "@/modules/family/permissions";

/** Prévia da exclusão de conta (ADR-0038): só papel e contagens, nunca dados de outros usuários. */
export type AccountDeletionPreview = {
  role: FamilyRole | null;
  otherActiveMembers: number;
  willEraseFamily: boolean;
  canDelete: boolean;
  hasPassword: boolean;
};
