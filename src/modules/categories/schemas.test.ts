import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
} from "@/modules/categories/constants";
import {
  categoryIdSchema,
  createCategorySchema,
  updateCategorySchema,
} from "@/modules/categories/schemas";

const ID = "123e4567-e89b-42d3-a456-426614174001";
const base = {
  name: " Mercado ",
  type: "expense",
  color: "chart-1",
  icon: "house",
} as const;

describe("constants", () => {
  it("6 cores e ícones únicos", () => {
    expect(CATEGORY_COLORS).toHaveLength(6);
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
    expect(CATEGORY_ICONS).toContain("ellipsis");
  });
});

describe("createCategorySchema", () => {
  it("válida: apara nome e parentId vazio vira undefined", () => {
    expect(createCategorySchema.parse({ ...base, parentId: "" })).toEqual({
      name: "Mercado",
      type: "expense",
      color: "chart-1",
      icon: "house",
      parentId: undefined,
    });
    expect(createCategorySchema.parse({ ...base, parentId: ID }).parentId).toBe(
      ID,
    );
  });

  it.each([
    [{ name: "   " }, "name"],
    [{ name: "x".repeat(51) }, "name"],
    [{ type: "transfer" }, "type"],
    [{ color: "red" }, "color"],
    [{ color: "#ff0000" }, "color"],
    [{ icon: "<script>" }, "icon"],
    [{ parentId: "x" }, "parentId"],
  ])("rejeita %j no campo %s", (patch, field) => {
    const result = createCategorySchema.safeParse({ ...base, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe(field);
  });
});

describe("updateCategorySchema / categoryIdSchema", () => {
  it("parentId aceita uuid ou null; não aceita tipo", () => {
    const input = {
      categoryId: ID,
      name: "Casa",
      color: "chart-2",
      icon: "house",
    };
    expect(
      updateCategorySchema.parse({ ...input, parentId: null }).parentId,
    ).toBeNull();
    expect(
      updateCategorySchema.parse({ ...input, parentId: ID }).parentId,
    ).toBe(ID);
    expect(
      updateCategorySchema.safeParse({ ...input, parentId: "x" }).success,
    ).toBe(false);
    expect(updateCategorySchema.safeParse(input).success).toBe(false);
    expect(
      "type" in
        updateCategorySchema.parse({
          ...input,
          type: "income",
          parentId: null,
        }),
    ).toBe(false);
  });

  it("categoryIdSchema valida uuid", () => {
    expect(categoryIdSchema.safeParse({ categoryId: ID }).success).toBe(true);
    expect(categoryIdSchema.safeParse({ categoryId: "1" }).success).toBe(false);
  });
});
