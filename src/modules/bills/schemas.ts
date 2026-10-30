import { z } from "zod";
import { addMonths, compareISODate, today } from "@/lib/dates";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";
import { optionalText, optionalUuid } from "@/lib/validation/optional-fields";
import {
  FREQUENCIES,
  INTERVAL_MAX,
  PAYROLL_DEDUCTION_EXPENSE_ONLY,
} from "@/modules/recurrences/constants";
import {
  DEFAULT_PAGE_SIZE,
  DESCRIPTION_MAX,
  NOTES_MAX,
} from "@/modules/transactions/constants";
import {
  BILL_KINDS,
  BILL_SITUATIONS,
  DEFAULT_BILL_SITUATION,
} from "./constants";

const description = z
  .string({ error: "Informe a descrição." })
  .trim()
  .min(1, "Informe a descrição.")
  .max(
    DESCRIPTION_MAX,
    `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`,
  );

const accountId = z.uuid("Escolha a conta ou o cartão.");
const categoryId = z.uuid("Escolha a categoria.");
const assignedMemberId = optionalUuid("Responsável inválido.");
const notes = optionalText(
  NOTES_MAX,
  `As observações devem ter no máximo ${NOTES_MAX} caracteres.`,
);
const transactionId = z.uuid("Compromisso inválido.");

const commonFields = {
  kind: z.enum(BILL_KINDS, { error: "Escolha se é a pagar ou a receber." }),
  description,
  amount: brlAmount({ positive: true }),
  // Vencimento pode ser futuro: sem `notAfterToday`.
  dueDate: isoDate(),
  accountId,
  categoryId,
  assignedMemberId,
  idempotencyKey: z.uuid("Chave de idempotência inválida."),
};

/**
 * União por `repeat`. Com `repeat: true` a série não aceita `notes` (a chave é descartada pelo
 * schema: ocorrências nascem sem observações, ADR-0023 §4).
 */
export const billFormSchema = z.discriminatedUnion("repeat", [
  z.object({
    repeat: z.literal(false),
    ...commonFields,
    notes,
  }),
  z
    .object({
      repeat: z.literal(true),
      ...commonFields,
      frequency: z.enum(FREQUENCIES, { error: "Escolha a frequência." }),
      intervalCount: z
        .number({ error: "Informe um número de 1 a 12." })
        .int("Informe um número inteiro.")
        .min(1, "Informe um número de 1 a 12.")
        .max(INTERVAL_MAX, `Informe um número de 1 a ${INTERVAL_MAX}.`)
        .default(1),
      endDate: isoDate().optional(),
      /** Desconto em folha: só despesa; não gera contas a pagar nem debita saldo. */
      payrollDeduction: z.boolean({ error: "Valor inválido." }).default(false),
    })
    .refine((d) => !d.payrollDeduction || d.kind === "pagar", {
      path: ["payrollDeduction"],
      message: PAYROLL_DEDUCTION_EXPENSE_ONLY,
    })
    .refine((d) => d.endDate === undefined || d.endDate >= d.dueDate, {
      path: ["endDate"],
      message:
        "A data final deve ser igual ou posterior ao primeiro vencimento.",
    })
    // Espelha o banco (recurrences_before_write): início da série >= hoje - 12 meses.
    .refine((d) => compareISODate(d.dueDate, addMonths(today(), -12)) >= 0, {
      path: ["dueDate"],
      message: "O primeiro vencimento não pode ser anterior a 12 meses atrás.",
    }),
]);

export const updateBillSchema = z.object({
  transactionId,
  description,
  amount: brlAmount({ positive: true }),
  dueDate: isoDate(),
  accountId,
  categoryId,
  assignedMemberId,
  notes,
});

export const payBillSchema = z.object({
  transactionId,
  paidOn: isoDate({ notAfterToday: true }),
  amount: brlAmount({ positive: true }),
  accountId,
});

export const billIdSchema = z.object({ transactionId });

/** Cada parâmetro de URL inválido cai no padrão (ou some); nunca gera erro. */
export const billFiltersSchema = z
  .object({
    tipo: z.enum(BILL_KINDS).optional().catch(undefined),
    situacao: z.enum(BILL_SITUATIONS).catch(DEFAULT_BILL_SITUATION),
    de: isoDate().optional().catch(undefined),
    ate: isoDate().optional().catch(undefined),
    serie: z.uuid().optional().catch(undefined),
    pagina: z.coerce.number().int().min(1).catch(1),
    por_pagina: z.coerce
      .number()
      .pipe(z.union([z.literal(20), z.literal(50), z.literal(100)]))
      .catch(DEFAULT_PAGE_SIZE),
  })
  .catch({
    situacao: DEFAULT_BILL_SITUATION,
    pagina: 1,
    por_pagina: DEFAULT_PAGE_SIZE,
  });
