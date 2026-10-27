import {
  CircleCheckIcon,
  CirclePauseIcon,
  CircleXIcon,
  PlayIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/modules/goals/constants";

const STATUS_VIEW: Record<
  GoalStatus,
  {
    variant: "default" | "secondary" | "success" | "outline";
    icon: ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
  }
> = {
  active: { variant: "default", icon: PlayIcon },
  paused: { variant: "secondary", icon: CirclePauseIcon },
  completed: { variant: "success", icon: CircleCheckIcon },
  canceled: { variant: "outline", icon: CircleXIcon },
};

/** Badge + ícone + texto: nunca só cor. */
export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const view = STATUS_VIEW[status];
  const Icon = view.icon;
  return (
    <Badge variant={view.variant} className="shrink-0">
      <Icon aria-hidden="true" />
      {GOAL_STATUS_LABELS[status]}
    </Badge>
  );
}
