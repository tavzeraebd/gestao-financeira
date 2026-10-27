import { CalculatorIcon, DatabaseIcon, PencilIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const SOURCES = {
  known: { label: "Conhecido", variant: "outline", Icon: DatabaseIcon },
  informed: { label: "Informado", variant: "secondary", Icon: PencilIcon },
  estimated: { label: "Estimado", variant: "outline", Icon: CalculatorIcon },
} as const;

type ValueSourceBadgeProps = {
  source: keyof typeof SOURCES;
};

/** Origem de um valor de cenário: ícone + texto, nunca só cor. */
export function ValueSourceBadge({ source }: ValueSourceBadgeProps) {
  const { label, variant, Icon } = SOURCES[source];
  return (
    <Badge variant={variant} className={source === "estimated" ? "italic" : undefined}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
