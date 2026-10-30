import { Skeleton } from "@/components/ui/skeleton";

/** Mesmo esqueleto do /inicio: cabeçalho, 4 cards e 2 painéis, na mesma altura útil a partir de `lg`. */
export default function InicioLoading() {
  return (
    <div
      className="flex flex-col gap-4 lg:h-[calc(100dvh-7.5rem)] lg:min-h-[34rem]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Carregando o comprometimento…</span>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="hidden h-5 w-40 sm:block" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)]">
        <Skeleton className="h-96 w-full rounded-xl lg:col-span-2 lg:h-full" />
        <Skeleton className="h-96 w-full rounded-xl lg:h-full" />
      </div>
    </div>
  );
}
