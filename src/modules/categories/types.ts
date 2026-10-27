import type {
  CategoryColor,
  CategoryIconName,
  CategoryType,
} from "@/modules/categories/constants";

export type { CategoryColor, CategoryIconName, CategoryType };

export type CategoryView = {
  id: string;
  name: string;
  type: CategoryType;
  color: CategoryColor;
  icon: CategoryIconName;
  parentId: string | null;
  isDefault: boolean;
  archivedAt: string | null;
};

export type CategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
  color: CategoryColor;
  icon: CategoryIconName;
};
