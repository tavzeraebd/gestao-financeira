import { z } from "zod";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";
import { optionalText } from "@/lib/validation/optional-fields";
import {
  DEFAULT_SPLIT_FILTER,
  DEFAULT_SPLIT_PAGE_SIZE,
  MAX_PARTS,
  MIN_PARTS,
  SETTLEMENT_NOTES_MAX,
  SPLIT_FILTERS,
  SPLIT_PAGE_SIZES,
} from "./constants";

const transactionId = z.uuid("Despesa inválida.");
const memberId = z.uuid("Integrante inválido.");
const partsMessage = `Escolha de ${MIN_PARTS} a ${MAX_PARTS} integrantes.`;
const distinctMessage = "Cada integrante só pode aparecer uma vez.";

const hasDistinct = (ids: readonly string[]) => new Set(ids).size === ids.length;

const equalSplit = z.object({
  mode: z.literal("equal"),
  transactionId,
  memberIds: z
    .array(memberId)
    .min(MIN_PARTS, partsMessage)
    .max(MAX_PARTS, partsMessage)
    .refine(hasDistinct, distinctMessage),
});

const amountsSplit = z.object({
  mode: z.literal("amounts"),
  transactionId,
  shares: z
    .array(z.object({ memberId, amount: brlAmount({ positive: true }) }))
    .min(MIN_PARTS, partsMessage)
    .max(MAX_PARTS, partsMessage)
    .refine((shares) => hasDistinct(shares.map((s) => s.memberId)), distinctMessage),
});

const noSplit = z.object({ mode: z.literal("none"), transactionId });

export const setSplitSchema = z.discriminatedUnion("mode", [
  equalSplit,
  amountsSplit,
  noSplit,
]);

export const settlementSchema = z
  .object({
    fromMemberId: z.uuid("Escolha quem paga."),
    toMemberId: z.uuid("Escolha quem recebe."),
    amount: brlAmount({ positive: true }),
    settlementDate: isoDate({ notAfterToday: true }),
    notes: optionalText(
      SETTLEMENT_NOTES_MAX,
      `A observação deve ter no máximo ${SETTLEMENT_NOTES_MAX} caracteres.`,
    ),
    idempotencyKey: z.uuid("Chave de idempotência inválida."),
  })
  .refine((d) => d.fromMemberId !== d.toMemberId, {
    path: ["toMemberId"],
    message: "Escolha dois integrantes diferentes.",
  });

export const settlementIdSchema = z.object({
  settlementId: z.uuid("Acerto inválido."),
});

/** URL tolerante: parâmetro inválido cai no padrão; nunca gera erro. */
export const splitFiltersSchema = z
  .object({
    situacao: z.enum(SPLIT_FILTERS).catch(DEFAULT_SPLIT_FILTER),
    pagina: z.coerce.number().int().min(1).catch(1),
    por_pagina: z.coerce
      .number()
      .pipe(
        z.union([
          z.literal(SPLIT_PAGE_SIZES[0]),
          z.literal(SPLIT_PAGE_SIZES[1]),
          z.literal(SPLIT_PAGE_SIZES[2]),
        ]),
      )
      .catch(DEFAULT_SPLIT_PAGE_SIZE),
  })
  .catch({
    situacao: DEFAULT_SPLIT_FILTER,
    pagina: 1,
    por_pagina: DEFAULT_SPLIT_PAGE_SIZE,
  });
