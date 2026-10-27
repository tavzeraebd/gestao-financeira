import { Skeleton } from "@/components/ui/skeleton";

export default function PublicLoading() {
  return (
    <div
      className="bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl p-6 ring-1"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
