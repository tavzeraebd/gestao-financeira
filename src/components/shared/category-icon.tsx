import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Car,
  CreditCard,
  Dog,
  Dumbbell,
  Ellipsis,
  Fuel,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PartyPopper,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Undo2,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import { cn } from "@/lib/utils";

/** Um nome da allowlist sem componente quebra o typecheck. */
export const CATEGORY_ICON_COMPONENTS: Record<CategoryIconName, LucideIcon> = {
  house: House,
  utensils: Utensils,
  car: Car,
  fuel: Fuel,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  "party-popper": PartyPopper,
  plane: Plane,
  dumbbell: Dumbbell,
  repeat: Repeat,
  zap: Zap,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  shirt: Shirt,
  gift: Gift,
  baby: Baby,
  dog: Dog,
  smartphone: Smartphone,
  ellipsis: Ellipsis,
  briefcase: Briefcase,
  "hand-coins": HandCoins,
  laptop: Laptop,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  "undo-2": Undo2,
  wallet: Wallet,
  landmark: Landmark,
  banknote: Banknote,
  "credit-card": CreditCard,
};

// Classes literais (o Tailwind não enxerga nomes montados em tempo de execução).
const COLOR_CLASSES: Record<CategoryColor, string> = {
  "chart-1": "bg-chart-1/15 text-chart-1",
  "chart-2": "bg-chart-2/15 text-chart-2",
  "chart-3": "bg-chart-3/15 text-chart-3",
  "chart-4": "bg-chart-4/15 text-chart-4",
  "chart-5": "bg-chart-5/15 text-chart-5",
  "chart-6": "bg-chart-6/15 text-chart-6",
};

const SIZE_CLASSES = {
  sm: { box: "size-8", icon: "size-4" },
  md: { box: "size-10", icon: "size-5" },
} as const;

type CategoryIconProps = {
  icon: CategoryIconName;
  color: CategoryColor;
  size?: "sm" | "md";
  className?: string;
};

/** Decorativo (`aria-hidden`): o nome da categoria sempre aparece ao lado. */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: CategoryIconProps) {
  const Icon = CATEGORY_ICON_COMPONENTS[icon] ?? Ellipsis;
  const sizes = SIZE_CLASSES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        sizes.box,
        COLOR_CLASSES[color],
        className,
      )}
    >
      <Icon className={sizes.icon} />
    </span>
  );
}
