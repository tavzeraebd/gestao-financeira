import type { FamilyRole } from "@/modules/family/permissions";

/** Evento de segurança da própria conta: só ação e data (sem IP nem metadata). */
export type SecurityEvent = {
  id: string;
  action: "password.changed";
  createdAt: string;
};

/** Prévia da exclusão de conta (ADR-0038): só papel e contagens, nunca dados de outros usuários. */
export type AccountDeletionPreview = {
  role: FamilyRole | null;
  otherActiveMembers: number;
  willEraseFamily: boolean;
  canDelete: boolean;
  hasPassword: boolean;
};
