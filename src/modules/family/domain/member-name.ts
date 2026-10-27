export const FORMER_MEMBER_NAME = "Ex-integrante";

/** Nome exibido do integrante; perfil não legível (ex-integrante) → "Ex-integrante". */
export function memberDisplayName(name: string | null): string {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" ? FORMER_MEMBER_NAME : trimmed;
}
