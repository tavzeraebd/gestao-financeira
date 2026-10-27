import {
  Baby,
  Briefcase,
  Car,
  GraduationCap,
  Gift,
  HeartPulse,
  House,
  Laptop,
  PiggyBank,
  Plane,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * As 12 chaves do check `goals_icon_check` do banco. Espelha `GoalIconName` de
 * `modules/goals/constants` (A-be); trocar por import quando ele for publicado.
 */
export type GoalIconKey =
  | "target"
  | "plane"
  | "house"
  | "car"
  | "shield"
  | "graduation-cap"
  | "heart-pulse"
  | "gift"
  | "baby"
  | "briefcase"
  | "laptop"
  | "piggy-bank";

/** Um nome sem componente quebra o typecheck. */
export const GOAL_ICON_COMPONENTS: Record<GoalIconKey, LucideIcon> = {
  target: Target,
  plane: Plane,
  house: House,
  car: Car,
  shield: ShieldCheck,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  gift: Gift,
  baby: Baby,
  briefcase: Briefcase,
  laptop: Laptop,
  "piggy-bank": PiggyBank,
};

const SIZE_CLASSES = {
  sm: { box: "size-8", icon: "size-4" },
  md: { box: "size-10", icon: "size-5" },
  lg: { box: "size-14", icon: "size-7" },
} as const;

type GoalIconProps = {
  icon: GoalIconKey;
  size?: keyof typeof SIZE_CLASSES;
  /** Sem `label` é decorativo (`aria-hidden`); o nome da meta aparece ao lado. */
  label?: string;
  className?: string;
};

export function GoalIcon({ icon, size = "md", label, className }: GoalIconProps) {
  const Icon = GOAL_ICON_COMPONENTS[icon] ?? Target;
  const sizes = SIZE_CLASSES[size];
  return (
    <span
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true as const })}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
        sizes.box,
        className,
      )}
    >
      <Icon className={sizes.icon} aria-hidden="true" />
    </span>
  );
}
