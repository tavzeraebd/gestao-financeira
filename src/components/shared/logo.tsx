import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "full" | "mark";
  className?: string;
};

/** Folha estilizada do Núcleo. Cor via `currentColor` (defina com `text-primary`). */
export function Logo({ variant = "full", className }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Núcleo"
      className={cn("text-primary inline-flex items-center gap-2", className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        fill="currentColor"
      >
        <path d="M3 8c0-1.7 1.9-2.7 3.3-1.7C10 8.9 13 12.5 14 17c.4 1.8.5 3.7.3 5.5-.2 1.8-1.8 3-3.5 2.6C6.600 24 3 17 3 8Z" />
        <path
          opacity="0.75"
          d="M29 8c0-1.700-1.900-2.700-3.300-1.700C22 8.900 19 12.500 18 17c-.4 1.800-.5 3.700-.3 5.500.2 1.800 1.800 3 3.500 2.600C25.400 24 29 17 29 8Z"
        />
        <path d="M16 12c1.700 1.600 2.700 4 2.700 6.600V27a2.700 2.700 0 0 1-5.400 0v-8.400c0-2.600 1-5 2.700-6.600Z" />
      </svg>
      {variant === "full" ? (
        <span
          aria-hidden="true"
          className="text-foreground text-xl font-bold tracking-tight"
        >
          Núcleo
        </span>
      ) : null}
    </span>
  );
}
