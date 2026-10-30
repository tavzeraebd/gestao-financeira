import { z } from "zod";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";
import { DESCRIPTION_MAX } from "@/modules/transactions/constants";
import { BILL_KINDS } from "@/modules/bills/constants";
import {
  DEFAULT_RECURRENCE_SITUATION,
  PAYROLL_DEDUCTION_EXPENSE_ONLY,
  RECURRENCE_SITUATIONS,
} from "./constants";

const recurrenceId = z.uuid("Recorrência inválida.");

export const updateRecurrenceSchema = z
  .object({
    recurrenceId,
    /**
     * Tipo da série (só leitura na edição), opcional: com `receber`, `payrollDeduction` é recusado aqui.
     * A fonte da verdade é o tipo gravado, conferido no service (e o check 23514 do banco).
     */
    kind: z
      .enum(BILL_KINDS, { error: "Tipo de recorrência inválido." })
      .optional(),
    description: z
      .string({ error: "Informe a descrição." })
      .trim()
      .min(1, "Informe a descrição.")
      .max(
        DESCRIPTION_MAX,
        `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`,
      ),
    amount: brlAmount({ positive: true }),
    accountId: z.uuid("Escolha a conta ou o cartão."),
    categoryId: z.uuid("Escolha a categoria."),
    /** `null` remove o responsável. */
    assignedMemberId: z.uuid("Responsável inválido.").nullish(),
    /** `null` remove o término. A data mínima (≥ início da série) é conferida no banco. */
    endDate: isoDate().nullish(),
    /** Desconto em folha: só despesa (o banco também recusa, 23514). */
    payrollDeduction: z.boolean({ error: "Valor inválido." }).default(false),
  })
  .refine((d) => !d.payrollDeduction || d.kind !== "receber", {
    path: ["payrollDeduction"],
    message: PAYROLL_DEDUCTION_EXPENSE_ONLY,
  });

export const recurrenceIdSchema = z.object({ recurrenceId });

export const endRecurrenceSchema = z.object({
  recurrenceId,
  endDate: isoDate(),
});

/** Parâmetro de URL inválido cai no padrão; nunca gera erro. */
export const recurrenceFiltersSchema = z
  .object({
    situacao: z.enum(RECURRENCE_SITUATIONS).catch(DEFAULT_RECURRENCE_SITUATION),
  })
  .catch({ situacao: DEFAULT_RECURRENCE_SITUATION });
