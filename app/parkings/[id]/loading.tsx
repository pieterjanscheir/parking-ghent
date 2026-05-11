import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Skeleton className="mb-6 h-4 w-32" />

      <div className="surface-card rounded-xl border border-border/70 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2.5">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="size-9 shrink-0 rounded-full" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <Skeleton className="size-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>

        <div className="mt-8 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>

        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </dl>

        <Skeleton className="mt-8 h-9 w-32 rounded-md" />
      </div>

      <div className="mt-6 surface-card rounded-xl border border-border/70 p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-44 rounded-md" />
          </div>
          <Skeleton className="h-56 w-full" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
      </div>

      <Skeleton className="mt-6 h-[360px] w-full rounded-xl" />
    </div>
  );
}
