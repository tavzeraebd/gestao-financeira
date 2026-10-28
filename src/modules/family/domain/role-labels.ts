/** Rótulo pt-BR do papel; papel desconhecido cai em "Integrante". */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Integrante",
};

export function roleLabel(role: unknown): string {
  return typeof role === "string" && Object.hasOwn(ROLE_LABELS, role)
    ? (ROLE_LABELS[role] ?? "Integrante")
    : "Integrante";
}
