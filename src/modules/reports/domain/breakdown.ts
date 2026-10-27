import { percentOf, sumCents, type Cents } from "@/lib/money";
import type { CategoryView } from "@/modules/categories/types";
import {
  MAX_SLICES,
  OTHER_CATEGORIES_KEY,
  OTHER_CATEGORIES_NAME,
  REMOVED_CATEGORY_NAME,
} from "../constants";
import type { CategoryBreakdown, CategorySlice } from "../types";

/**
 * D16: fatias = categorias com valor > 0, em ordem decrescente. Com mais de `MAX_SLICES` categorias,
 * as `MAX_SLICES - 1` maiores + "Outras categorias". `percent` sobre a soma dos positivos.
 */
export function buildCategoryBreakdown(
  rows: readonly { categoryId: string; amount: Cents }[],
  categories: ReadonlyMap<string, CategoryView>,
  total: Cents,
): CategoryBreakdown {
  const toSlice = (row: { categoryId: string; amount: Cents }): CategorySlice => {
    const category = categories.get(row.categoryId);
    return {
      key: row.categoryId,
      categoryId: row.categoryId,
      name: category?.name ?? REMOVED_CATEGORY_NAME,
      color: category?.color ?? "chart-6",
      icon: category?.icon ?? "ellipsis",
      amount: row.amount,
      percent: 0,
      archived: category ? category.archivedAt !== null : false,
    };
  };

  const positive = rows
    .filter((r) => r.amount > 0)
    .sort((a, b) =>
      a.amount === b.amount
        ? a.categoryId.localeCompare(b.categoryId)
        : b.amount - a.amount,
    );
  const negative = rows
    .filter((r) => r.amount < 0)
    .sort((a, b) =>
      a.amount === b.amount
        ? a.categoryId.localeCompare(b.categoryId)
        : a.amount - b.amount,
    )
    .map(toSlice);

  const positiveTotal = sumCents(positive.map((r) => r.amount));
  const withPercent = (slice: CategorySlice): CategorySlice => ({
    ...slice,
    percent: percentOf(slice.amount, positiveTotal) ?? 0,
  });

  const tableRows = positive.map((r) => withPercent(toSlice(r)));

  let slices = tableRows;
  if (positive.length > MAX_SLICES) {
    const rest = positive.slice(MAX_SLICES - 1);
    const restAmount = sumCents(rest.map((r) => r.amount));
    slices = [
      ...tableRows.slice(0, MAX_SLICES - 1),
      withPercent({
        key: OTHER_CATEGORIES_KEY,
        categoryId: null,
        name: OTHER_CATEGORIES_NAME,
        color: "chart-6",
        icon: null,
        amount: restAmount,
        percent: 0,
        archived: false,
      }),
    ];
  }

  return {
    total,
    slices,
    negative,
    rows: [...tableRows, ...negative],
  };
}
