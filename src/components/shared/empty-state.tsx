import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon ? (
        <span className="bg-primary-soft-strong text-primary-text flex size-12 items-center justify-center rounded-full">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      ) : null}
      <h2 className="text-foreground text-base font-semibold">{title}</h2>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
