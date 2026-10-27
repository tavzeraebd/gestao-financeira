import { z } from "zod";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";
import { optionalText, optionalUuid } from "@/lib/validation/optional-fields";
import {
  DEFAULT_ORDER,
  DEFAULT_PAGE_SIZE,
  DESCRIPTION_MAX,
  NO_MEMBER_FILTER,
  NOTES_MAX,
  ORDER_OPTIONS,
  SEARCH_MAX,
  TYPE_FILTERS,
} from "@/modules/transactions/constants";

const description = z
  .string({ error: "Informe a descrição." })
  .trim()
  .min(1, "Informe a descrição.")
  .max(
    DESCRIPTION_MAX,
    `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`,
  );

const accountId = z.uuid("Escolha a conta.");
const notes = optionalText(
  NOTES_MAX,
  `As observações devem ter no máximo ${NOTES_MAX} caracteres.`,
);
const assignedMemberId = optionalUuid("Responsável inválido.");
const idempotencyKey = z.uuid("Chave de idempotência inválida.");

/** Campos comuns de receita e despesa (sem `type`). */
const categorizedFields = {
  description,
  amount: brlAmount({ positive: true }),
  transactionDate: isoDate({ notAfterToday: true }),
  accountId,
  categoryId: z.uuid("Escolha a categoria."),
  assignedMemberId,
  notes,
};

const transferFields = {
  description,
  amount: brlAmount({ positive: true }),
  transactionDate: isoDate({ notAfterToday: true }),
  accountId: z.uuid("Escolha a conta de origem."),
  destinationAccountId: z.uuid("Escolha a conta de destino."),
  assignedMemberId,
  notes,
};

const differentAccounts = {
  check: (d: { accountId: string; destinationAccountId: string }) =>
    d.accountId !== d.destinationAccountId,
  params: {
    path: ["destinationAccountId"],
    message: "A conta de destino deve ser diferente da conta de origem.",
  },
};

export const transactionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("expense"),
    ...categorizedFields,
    idempotencyKey,
  }),
  z.object({
    type: z.literal("income"),
    ...categorizedFields,
    idempotencyKey,
  }),
  z
    .object({ type: z.literal("transfer"), ...transferFields, idempotencyKey })
    .refine(differentAccounts.check, differentAccounts.params),
]);

/** `type` só discrimina: o service compara com o tipo gravado (imutável) e responde `VALIDATION_ERROR`. */
export const updateTransactionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("expense"),
    transactionId: z.uuid("Lançamento inválido."),
    ...categorizedFields,
  }),
  z.object({
    type: z.literal("income"),
    transactionId: z.uuid("Lançamento inválido."),
    ...categorizedFields,
  }),
  z
    .object({
      type: z.literal("transfer"),
      transactionId: z.uuid("Lançamento inválido."),
      ...transferFields,
    })
    .refine(differentAccounts.check, differentAccounts.params),
]);

export const reverseTransactionSchema = z.object({
  transactionId: z.uuid("Lançamento inválido."),
  amount: brlAmount({ positive: true }),
  transactionDate: isoDate({ notAfterToday: true }),
  // Padrão `Estorno: <descrição original>` (cortado em 120) é aplicado pelo service.
  description: optionalText(
    DESCRIPTION_MAX,
    `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`,
  ),
  idempotencyKey,
});

export const transactionIdSchema = z.object({
  transactionId: z.uuid("Lançamento inválido."),
});

/** Cada parâmetro de URL inválido cai no padrão (ou some); nunca gera erro. */
export const transactionFiltersSchema = z
  .object({
    de: isoDate().optional().catch(undefined),
    ate: isoDate().optional().catch(undefined),
    tipo: z.enum(TYPE_FILTERS).optional().catch(undefined),
    conta: z.uuid().optional().catch(undefined),
    categoria: z.uuid().optional().catch(undefined),
    responsavel: z
      .union([z.uuid(), z.literal(NO_MEMBER_FILTER)])
      .optional()
      .catch(undefined),
    q: z
      .string()
      .trim()
      .max(SEARCH_MAX)
      .transform((value) => (value === "" ? undefined : value))
      .optional()
      .catch(undefined),
    ordem: z.enum(ORDER_OPTIONS).catch(DEFAULT_ORDER),
    pagina: z.coerce.number().int().min(1).catch(1),
    por_pagina: z.coerce
      .number()
      .pipe(z.union([z.literal(20), z.literal(50), z.literal(100)]))
      .catch(DEFAULT_PAGE_SIZE),
  })
  .catch({ ordem: DEFAULT_ORDER, pagina: 1, por_pagina: DEFAULT_PAGE_SIZE });
