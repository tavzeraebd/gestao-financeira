import { z } from "zod";

/** Sem `trim` na senha (alterá-la em silêncio quebraria a conferência). Sem família no input: vem da sessão. */
export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, "Informe sua senha.")
    .max(72, "A senha deve ter no máximo 72 caracteres."),
  confirmation: z.literal("EXCLUIR", {
    error: "Digite EXCLUIR para confirmar.",
  }),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Informe seu nome.")
    .max(80, "O nome deve ter no máximo 80 caracteres."),
});
