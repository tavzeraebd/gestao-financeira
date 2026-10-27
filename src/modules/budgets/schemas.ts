import { z } from "zod";
import { startOfMonth, today, type ISODate } from "@/lib/dates";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";

/** `"YYYY-MM"` -> `ISODate` do dia 1 (≥ 2000-01-01). */
const monthField = z
  .string({ error: "Informe o mês." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe um mês válido.")
  .transform((value) => `${value}-01`)
  .pipe(isoDate());

const budgetId = z.uuid("Orçamento inválido.");
const amountLimit = brlAmount({ positive: true });

export const budgetInputSchema = z
  .object({
    /** `null` = todas as despesas. */
    categoryId: z.uuid("Escolha a categoria.").nullable(),
    amountLimit,
    startMonth: monthField,
    endMonth: monthField.optional(),
  })
  .refine((d) => d.endMonth === undefined || d.endMonth >= d.startMonth, {
    path: ["endMonth"],
    message: "O mês final deve ser igual ou posterior ao mês inicial.",
  });

export const updateBudgetSchema = z.object({
  budgetId,
  amountLimit,
  /** `null` remove o término. */
  endMonth: monthField.nullish(),
});

export const budgetIdSchema = z.object({ budgetId });

const currentMonth = (): ISODate => startOfMonth(today());

/** URL tolerante: `mes` inválido ou ausente vira o mês atual; `arquivados=sim` liga o filtro. */
export const budgetMonthSchema = z
  .object({
    mes: monthField.catch(currentMonth),
    arquivados: z
      .literal("sim")
      .transform(() => true)
      .catch(false),
  })
  .catch(() => ({ mes: currentMonth(), arquivados: false }));
