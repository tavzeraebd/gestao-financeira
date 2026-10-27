import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Informe seu nome.")
    .max(80, "O nome deve ter no máximo 80 caracteres."),
});
