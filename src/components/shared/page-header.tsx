import type { ReactNode } from "react";

import { InfoHint } from "@/components/shared/info-hint";

type PageHeaderProps = {
  title: string;
  /** Texto explicativo da tela: vai para o botão ⓘ ao lado do título, nunca direto na tela. */
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="text-foreground text-xl font-bold">{title}</h1>
        {description ? <InfoHint label={title}>{description}</InfoHint> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
