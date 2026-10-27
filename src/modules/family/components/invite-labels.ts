import type { FamilyRole } from "@/modules/family/permissions";

export const ROLE_LABELS: Record<FamilyRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Integrante",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** Data e hora no fuso de Brasília; igual no servidor e no navegador (evita divergência na hidratação). */
export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}
