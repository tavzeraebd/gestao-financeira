import { Skeleton } from "@/components/ui/skeleton";

export default function RecurrencesLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Carregando recorrências…</span>
      <Skeleton className="h-10 w-72" />
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
