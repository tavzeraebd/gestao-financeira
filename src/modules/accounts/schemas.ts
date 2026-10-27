import { z } from "zod";
import { negCents, type Cents } from "@/lib/money";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount, readBRL } from "@/lib/validation/money";
import { optionalText } from "@/lib/validation/optional-fields";
import { ACCOUNT_TYPES } from "@/modules/accounts/constants";

const name = z
  .string({ error: "Informe o nome da conta." })
  .trim()
  .min(1, "Informe o nome da conta.")
  .max(60, "O nome deve ter no máximo 60 caracteres.");

const institutionName = optionalText(
  80,
  "A instituição deve ter no máximo 80 caracteres.",
);

const accountType = z.enum(ACCOUNT_TYPES, {
  error: "Escolha o tipo da conta.",
});

/** Dia do mês (1..31) vindo de um número ou do texto de um select; vazio vira `undefined`. */
const dayOfMonth = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value, ctx): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    const day = typeof value === "number" ? value : Number(value.trim());
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      ctx.issues.push({
        code: "custom",
        message: "Informe um dia entre 1 e 31.",
        input: value,
      });
      return z.NEVER;
    }
    return day;
  });

/** Limite opcional do cartão: vazio vira `undefined`; se informado, deve ser > 0. */
const creditLimit = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx): Cents | undefined => {
    if (value === undefined || value === "") return undefined;
    const result = readBRL(value, { positive: true });
    if (!result.ok) {
      ctx.issues.push({
        code: "custom",
        message: result.message,
        input: value,
      });
      return z.NEVER;
    }
    return result.value;
  });

/**
 * Regras que dependem do tipo: o cartão exige fechamento e vencimento; as demais contas ignoram
 * limite e dias (valores que sobram de uma troca de tipo no formulário não geram erro).
 */
function applyCardRules<
  T extends {
    type: (typeof ACCOUNT_TYPES)[number];
    creditLimit: Cents | undefined;
    statementClosingDay: number | undefined;
    statementDueDay: number | undefined;
  },
>(data: T, ctx: z.RefinementCtx): T {
  if (data.type !== "credit_card") {
    return {
      ...data,
      creditLimit: undefined,
      statementClosingDay: undefined,
      statementDueDay: undefined,
    };
  }
  if (data.statementClosingDay === undefined) {
    ctx.issues.push({
      code: "custom",
      path: ["statementClosingDay"],
      message: "Informe o dia de fechamento da fatura.",
      input: data.statementClosingDay,
    });
  }
  if (data.statementDueDay === undefined) {
    ctx.issues.push({
      code: "custom",
      path: ["statementDueDay"],
      message: "Informe o dia de vencimento da fatura.",
      input: data.statementDueDay,
    });
  }
  return data;
}

export const createAccountSchema = z
  .object({
    name,
    type: accountType,
    institutionName,
    // Texto cru: o sinal depende do tipo (cartão informa a dívida como valor positivo).
    openingBalance: z.string({ error: "Informe o valor." }),
    openingBalanceDate: isoDate({ notAfterToday: true }),
    creditLimit,
    statementClosingDay: dayOfMonth,
    statementDueDay: dayOfMonth,
  })
  .transform((data, ctx) => {
    const isCard = data.type === "credit_card";
    // Cartão: a dívida entra positiva e é gravada `<= 0`; demais contas aceitam saldo negativo.
    const balance = readBRL(data.openingBalance, {
      allowNegative: !isCard,
    });
    if (!balance.ok) {
      ctx.issues.push({
        code: "custom",
        path: ["openingBalance"],
        message: balance.message,
        input: data.openingBalance,
      });
      return z.NEVER;
    }
    const checked = applyCardRules(data, ctx);
    return {
      ...checked,
      openingBalance: isCard ? negCents(balance.value) : balance.value,
    };
  });

export const updateAccountSchema = z.object({
  accountId: z.uuid("Conta inválida."),
  name,
  institutionName,
  // O tipo não vem do formulário: o service lê do banco e interpreta o sinal (cartão: dívida positiva).
  openingBalance: brlAmount({ allowNegative: true }),
  openingBalanceDate: isoDate({ notAfterToday: true }),
  creditLimit,
  statementClosingDay: dayOfMonth,
  statementDueDay: dayOfMonth,
});

export const accountIdSchema = z.object({
  accountId: z.uuid("Conta inválida."),
});
