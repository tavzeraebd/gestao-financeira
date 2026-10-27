import { z } from "zod";
import { optionalUuid } from "@/lib/validation/optional-fields";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_TYPES,
} from "@/modules/categories/constants";

const name = z
  .string({ error: "Informe o nome da categoria." })
  .trim()
  .min(1, "Informe o nome da categoria.")
  .max(50, "O nome deve ter no máximo 50 caracteres.");

const color = z.enum(CATEGORY_COLORS, { error: "Escolha uma cor." });
const icon = z.enum(CATEGORY_ICONS, { error: "Escolha um ícone." });

export const createCategorySchema = z.object({
  name,
  type: z.enum(CATEGORY_TYPES, { error: "Escolha o tipo da categoria." }),
  color,
  icon,
  parentId: optionalUuid("Categoria pai inválida."),
});

export const updateCategorySchema = z.object({
  categoryId: z.uuid("Categoria inválida."),
  name,
  color,
  icon,
  parentId: z.uuid("Categoria pai inválida.").nullable(),
});

export const categoryIdSchema = z.object({
  categoryId: z.uuid("Categoria inválida."),
});
