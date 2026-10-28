import { z } from "zod";
import { brlAmount } from "@/lib/validation/money";
import {
  FINANCING_MONTHS_MAX,
  FINANCING_MONTHS_MIN,
  PROJECTION_MONTHS_MAX,
  PROJECTION_MONTHS_MIN,
  RATE_MAX_DECIMALS,
  RATE_MAX_PERCENT,
  REDUCTION_PERCENT_MAX,
  REDUCTION_PERCENT_MAX_DECIMALS,
  SAVING_MONTHS_MAX,
  SAVING_MONTHS_MIN,
} from "./constants";

// Validação no cliente: nada vai ao servidor (ADR-0027). Os campos chegam como texto do formulário.

const emptyToUndefined = (value: string) =>
  value.trim() === "" ? undefined : value.trim();

/** Inteiro positivo digitado ("36"). */
function wholeMonths(min: number, max: number, label: string) {
  const message = `Informe ${label} entre ${min} e ${max}.`;
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d{1,4}$/, message)
    .transform((value) => Number(value))
    .refine((n) => n >= min && n <= max, message);
}

/** Número decimal com vírgula ou ponto, até `decimals` casas ("1,5"), sem notação científica. */
function decimalNumber(decimals: number, message: string) {
  const pattern = new RegExp(`^\\d{1,3}([.,]\\d{1,${decimals}})?$`);
  return z
    .string({ error: message })
    .trim()
    .regex(pattern, message)
    .transform((value) => Number(value.replace(",", ".")));
}

const optional = <O>(schema: z.ZodType<O, string>) =>
  z.string().transform(emptyToUndefined).pipe(z.optional(schema)).optional();

const money = brlAmount({ positive: true });

const rate = decimalNumber(
  RATE_MAX_DECIMALS,
  `Informe a taxa mensal em %, de 0 a ${RATE_MAX_PERCENT}, com até ${RATE_MAX_DECIMALS} casas.`,
).refine((n) => n <= RATE_MAX_PERCENT, {
  message: `A taxa mensal deve ser de no máximo ${RATE_MAX_PERCENT}%.`,
});

export const financingSchema = z
  .object({
    value: money,
    downPayment: brlAmount(),
    months: wholeMonths(
      FINANCING_MONTHS_MIN,
      FINANCING_MONTHS_MAX,
      "o prazo em meses",
    ),
    monthlyRate: rate,
  })
  .refine((d) => d.downPayment < d.value, {
    path: ["downPayment"],
    message: "A entrada deve ser menor que o valor.",
  });

export const savingSchema = z
  .object({
    target: money,
    saved: optional(brlAmount()),
    monthlyContribution: optional(money),
    months: optional(
      wholeMonths(SAVING_MONTHS_MIN, SAVING_MONTHS_MAX, "o prazo em meses"),
    ),
  })
  .refine(
    (d) => (d.monthlyContribution === undefined) !== (d.months === undefined),
    {
      path: ["monthlyContribution"],
      message: "Informe o aporte mensal ou o prazo (um dos dois).",
    },
  );

export const goalDeadlineSchema = z.object({
  goalId: z.uuid("Escolha uma meta."),
  monthly: optional(money),
});

export const newCommitmentSchema = z.object({ monthly: money });

export const reductionSchema = z
  .object({
    categoryId: z.uuid("Escolha uma categoria."),
    percent: optional(
      decimalNumber(
        REDUCTION_PERCENT_MAX_DECIMALS,
        "Informe um percentual válido, como 10 ou 12,5.",
      ).refine((n) => n > 0 && n <= REDUCTION_PERCENT_MAX, {
        message: `O percentual deve ser maior que 0 e no máximo ${REDUCTION_PERCENT_MAX}.`,
      }),
    ),
    amount: optional(money),
  })
  .refine((d) => (d.percent === undefined) !== (d.amount === undefined), {
    path: ["percent"],
    message: "Informe o percentual ou o valor (um dos dois).",
  });

export const projectionSchema = z.object({
  months: wholeMonths(
    PROJECTION_MONTHS_MIN,
    PROJECTION_MONTHS_MAX,
    "o número de meses",
  ),
  /** Ajuste mensal; vazio = 0. Pode ser negativo. */
  monthlyAdjustment: z
    .string()
    .transform((value) => (value.trim() === "" ? "0" : value))
    .pipe(brlAmount({ allowNegative: true })),
});
