import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Use um e-mail de até 254 caracteres.")
  .pipe(z.email("Informe um e-mail válido."));

// Senha não sofre trim: alterar a senha digitada em silêncio quebraria o login.
const newPassword = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "A senha deve ter ao menos uma letra.")
  .regex(/[0-9]/, "A senha deve ter ao menos um número.");

export const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Informe seu nome.")
    .max(80, "O nome deve ter no máximo 80 caracteres."),
  email,
  password: newPassword,
  next: z.string().max(512).optional(),
});

export const signInSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Informe sua senha.")
    .max(72, "A senha deve ter no máximo 72 caracteres."),
  next: z.string().max(512).optional(),
});

export const requestPasswordResetSchema = z.object({ email });

export const resendConfirmationSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    error: "As senhas não conferem.",
  });
