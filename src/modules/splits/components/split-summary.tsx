import { UsersIcon } from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/shared/money";
import { buttonVariants } from "@/components/ui/button";
import type { SplitDetail } from "@/modules/splits/types";

/**
 * Atalho discreto para a divisão da despesa (detalhe de lançamento e de compromisso).
 * `detail` é `null` para o que não se divide (receita, transferência); sem permissão
 * e sem divisão, não há nada a mostrar.
 */
export function SplitSummary({ detail }: { detail: SplitDetail | null }) {
  if (!detail || !detail.splittable) return null;
  const hasDivision = detail.parts.length > 0;
  if (!hasDivision && !detail.canEdit) return null;

  const href = `/divisao/${detail.transaction.id}`;

  return (
    <section
      aria-label="Divisão da despesa"
      className="flex flex-col gap-2 text-sm"
    >
      {hasDivision ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground inline-flex items-center gap-1.5">
            <UsersIcon aria-hidden="true" className="size-4" />
            Dividida entre {detail.parts.length}
          </p>
          <ul className="flex flex-col gap-0.5">
            {detail.parts.map((part) => (
              <li
                key={part.member.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 break-words">
                  {part.member.displayName}
                </span>
                <Money cents={part.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.canEdit ? (
        <Link
          href={href}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {hasDivision ? "Editar divisão" : "Dividir despesa"}
        </Link>
      ) : (
        <Link href={href} className="text-primary-text self-start underline">
          Ver divisão
        </Link>
      )}
    </section>
  );
}
