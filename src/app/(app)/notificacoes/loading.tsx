import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Carregando notificações…</span>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-52" />
      </div>
      <Skeleton className="h-12 w-72" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
}
