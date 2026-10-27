import type {
  CategoryIconName,
  CategoryType,
} from "@/modules/categories/constants";

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  expense: "Despesa",
  income: "Receita",
};

/** Nome acessível de cada ícone da allowlist (os ícones são decorativos fora do seletor). */
export const CATEGORY_ICON_LABELS: Record<CategoryIconName, string> = {
  house: "Casa",
  utensils: "Talheres",
  car: "Carro",
  fuel: "Combustível",
  "heart-pulse": "Saúde",
  "graduation-cap": "Formatura",
  "book-open": "Livro",
  "party-popper": "Festa",
  plane: "Avião",
  dumbbell: "Academia",
  repeat: "Repetição",
  zap: "Energia",
  receipt: "Recibo",
  "shopping-bag": "Sacola",
  shirt: "Camiseta",
  gift: "Presente",
  baby: "Bebê",
  dog: "Cachorro",
  smartphone: "Celular",
  ellipsis: "Reticências",
  briefcase: "Maleta",
  "hand-coins": "Moedas",
  laptop: "Notebook",
  "trending-up": "Alta",
  "piggy-bank": "Cofrinho",
  "undo-2": "Desfazer",
  wallet: "Carteira",
  landmark: "Banco",
  banknote: "Cédula",
  "credit-card": "Cartão",
};
