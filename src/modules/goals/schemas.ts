import { z } from "zod";
import { compareISODate, today } from "@/lib/dates";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";
import { optionalText, optionalUuid } from "@/lib/validation/optional-fields";
import {
  CONTRIBUTION_KINDS,
  CONTRIBUTION_NOTES_MAX,
  DEFAULT_GOAL_FILTER,
  GOAL_DESCRIPTION_MAX,
  GOAL_FILTERS,
  GOAL_ICONS,
  GOAL_NAME_MAX,
} from "./constants";

const goalId = z.uuid("Meta inválida.");
const idempotencyKey = z.uuid("Chave de idempotência inválida.");

const goalFields = {
  name: z
    .string({ error: "Informe o nome da meta." })
    .trim()
    .min(1, "Informe o nome da meta.")
    .max(
      GOAL_NAME_MAX,
      `O nome deve ter no máximo ${GOAL_NAME_MAX} caracteres.`,
    ),
  description: optionalText(
    GOAL_DESCRIPTION_MAX,
    `A descrição deve ter no máximo ${GOAL_DESCRIPTION_MAX} caracteres.`,
  ),
  targetAmount: brlAmount({ positive: true }),
  icon: z.enum(GOAL_ICONS, { error: "Escolha um ícone." }),
};

/** Data-alvo vazia vira `undefined` (meta sem prazo). */
const targetDate = z
  .string()
  .transform((value) => (value.trim() === "" ? undefined : value))
  .pipe(isoDate().optional())
  .optional();

export const goalInputSchema = z
  .object({
    ...goalFields,
    targetDate,
    idempotencyKey,
  })
  .refine(
    (d) =>
      d.targetDate === undefined || compareISODate(d.targetDate, today()) >= 0,
    {
      path: ["targetDate"],
      message: "A data-alvo não pode ser anterior a hoje.",
    },
  );

/** Edição: sem chave de idempotência e sem a regra "data-alvo ≥ hoje". */
export const updateGoalSchema = z.object({
  goalId,
  ...goalFields,
  targetDate,
});

export const goalIdSchema = z.object({ goalId });

export const goalStatusSchema = z.object({
  goalId,
  to: z.enum(["active", "paused", "completed", "canceled"], {
    error: "Situação inválida.",
  }),
});

export const contributionSchema = z.object({
  goalId,
  kind: z.enum(CONTRIBUTION_KINDS, { error: "Escolha aporte ou retirada." }),
  amount: brlAmount({ positive: true }),
  contributionDate: isoDate({ notAfterToday: true }),
  /** Omitido = o próprio vínculo (resolvido no servidor). */
  memberId: optionalUuid("Integrante inválido."),
  notes: optionalText(
    CONTRIBUTION_NOTES_MAX,
    `A observação deve ter no máximo ${CONTRIBUTION_NOTES_MAX} caracteres.`,
  ),
  idempotencyKey,
});

export const contributionIdSchema = z.object({
  contributionId: z.uuid("Aporte inválido."),
});

/** URL tolerante: parâmetro inválido cai no padrão; nunca gera erro. */
export const goalFiltersSchema = z
  .object({
    situacao: z.enum(GOAL_FILTERS).catch(DEFAULT_GOAL_FILTER),
    pagina: z.coerce.number().int().min(1).catch(1),
  })
  .catch({ situacao: DEFAULT_GOAL_FILTER, pagina: 1 });
