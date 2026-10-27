import { Skeleton } from "@/components/ui/skeleton";

export default function PlanningLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Carregando planejamento…</span>
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
