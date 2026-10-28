import { z } from "zod";

export const createFamilySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da família.")
    .max(80, "O nome deve ter no máximo 80 caracteres."),
});

export const createInviteSchema = z.object({
  role: z.enum(["admin", "member"]).default("member"),
  // Vazio vira undefined (sem vínculo de e-mail).
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(
      z
        .email("Informe um e-mail válido.")
        .max(254, "Use um e-mail de até 254 caracteres.")
        .optional(),
    )
    .optional(),
});

export const revokeInviteSchema = z.object({
  inviteId: z.uuid("Convite inválido."),
});

export const acceptInviteSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, "Convite inválido."),
});

export const memberIdSchema = z.object({
  memberId: z.uuid("Integrante inválido."),
});

export const changeRoleSchema = z.object({
  memberId: z.uuid("Integrante inválido."),
  role: z.enum(["admin", "member"], { error: "Escolha um papel." }),
});

export const renameFamilySchema = createFamilySchema;
