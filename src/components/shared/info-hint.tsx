"use client";

import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type InfoHintProps = {
  /** Assunto explicado; compõe o nome acessível "Mais informações sobre <assunto>". */
  label: string;
  /** Substitui o nome acessível padrão (ex.: "Como calculamos Saldo atual"). */
  ariaLabel?: string;
  /** Título opcional dentro do balão. */
  title?: string;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * Botão ⓘ que guarda o texto explicativo da tela (convenção do projeto: texto
 * explicativo nunca fica direto na tela). Abre com hover/foco no desktop e com
 * toque/clique no celular; fecha com Esc e clique fora.
 */
export function InfoHint({
  label,
  ariaLabel,
  title,
  children,
  className,
  side = "bottom",
}: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={100}
        aria-label={ariaLabel ?? `Mais informações sobre ${label}`}
        className={cn(
          // Ícone pequeno; a área de toque chega a 40px pelo pseudo-elemento.
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring relative inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle transition-colors outline-none focus-visible:ring-3",
          "after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
          className,
        )}
      >
        <InfoIcon aria-hidden="true" className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" side={side} className="w-72">
        {title ? <PopoverTitle>{title}</PopoverTitle> : null}
        <PopoverDescription render={<div />} className="text-sm">
          {children}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
