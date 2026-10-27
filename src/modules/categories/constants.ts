export const CATEGORY_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_ICONS = [
  "house",
  "utensils",
  "car",
  "fuel",
  "heart-pulse",
  "graduation-cap",
  "book-open",
  "party-popper",
  "plane",
  "dumbbell",
  "repeat",
  "zap",
  "receipt",
  "shopping-bag",
  "shirt",
  "gift",
  "baby",
  "dog",
  "smartphone",
  "ellipsis",
  "briefcase",
  "hand-coins",
  "laptop",
  "trending-up",
  "piggy-bank",
  "undo-2",
  "wallet",
  "landmark",
  "banknote",
  "credit-card",
] as const;

export type CategoryIconName = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_TYPES = ["income", "expense"] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** Valor vindo do banco -> allowlist; ícone desconhecido vira `ellipsis`, cor desconhecida `chart-6`. */
export function toCategoryIcon(value: string): CategoryIconName {
  return (CATEGORY_ICONS as readonly string[]).includes(value)
    ? (value as CategoryIconName)
    : "ellipsis";
}

export function toCategoryColor(value: string): CategoryColor {
  return (CATEGORY_COLORS as readonly string[]).includes(value)
    ? (value as CategoryColor)
    : "chart-6";
}
