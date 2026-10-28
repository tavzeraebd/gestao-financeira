import { cn } from "@/lib/utils";

type SkipLinkProps = {
  /** `id` do `main` de destino (sem `#`). */
  targetId?: string;
  className?: string;
};

/**
 * Link "Pular para o conteúdo" (WCAG 2.4.1). Primeiro elemento focável da tela.
 * Visível só com foco de teclado; o destino precisa de `id` e `tabIndex={-1}`.
 */
export function SkipLink({ targetId = "conteudo", className }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only focus-visible:not-sr-only",
        "focus-visible:bg-background focus-visible:text-foreground focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50",
        "focus-visible:inline-flex focus-visible:min-h-10 focus-visible:items-center focus-visible:rounded-lg focus-visible:px-4 focus-visible:text-sm focus-visible:font-medium",
        "focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
        className,
      )}
    >
      Pular para o conteúdo
    </a>
  );
}
