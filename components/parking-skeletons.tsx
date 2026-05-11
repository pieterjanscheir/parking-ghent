import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function HeroCardSkeleton() {
  return (
    <div className="surface-card relative flex h-full flex-col gap-5 overflow-hidden rounded-xl border border-primary/40 bg-primary/[0.03] p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/80 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-16 rounded-4xl" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="size-9 shrink-0 rounded-full" />
      </div>

      <div className="flex items-center gap-5">
        <Skeleton className="size-24 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="surface-card relative flex flex-col gap-4 overflow-hidden rounded-xl border border-border/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="size-7 shrink-0 rounded-full" />
      </div>

      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function HeroGridSkeleton({ count }: { count: number }) {
  if (count <= 0) return null;
  const layout =
    count === 1
      ? "grid grid-cols-1 gap-4"
      : count === 2
        ? "grid grid-cols-1 gap-4 md:grid-cols-2"
        : "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3";
  return (
    <section className="mb-8">
      <div className={layout}>
        {Array.from({ length: count }).map((_, i) => (
          <HeroCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

const LIST_COLUMNS = [
  { key: "favorite", className: "w-12" },
  { key: "name", className: "" },
  { key: "status", className: "" },
  { key: "freeSpaces", className: "text-right" },
  { key: "trend", className: "w-10" },
  { key: "freePercent", className: "" },
  { key: "category", className: "" },
  { key: "type", className: "" },
  { key: "address", className: "" },
] as const;

const LIST_CELL_WIDTHS: Record<(typeof LIST_COLUMNS)[number]["key"], string> = {
  favorite: "size-5 rounded-full",
  name: "h-4 w-32",
  status: "h-5 w-16 rounded-full",
  freeSpaces: "h-4 w-8 ml-auto",
  trend: "h-4 w-6",
  freePercent: "h-4 w-20",
  category: "h-3 w-14",
  type: "h-3 w-16",
  address: "h-3 w-40",
};

export function ListViewSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="surface-card overflow-hidden rounded-xl border border-border/70">
      <div className="bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4">
          {LIST_COLUMNS.map((c) => (
            <div
              key={c.key}
              className={cn("flex-1", c.className && c.className)}
            >
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            {LIST_COLUMNS.map((c) => (
              <div
                key={c.key}
                className={cn("flex-1", c.className && c.className)}
              >
                <Skeleton className={LIST_CELL_WIDTHS[c.key]} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewHeaderSkeleton() {
  return (
    <header className="mb-8 space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-56" />
    </header>
  );
}

export function OverviewControlsSkeleton() {
  return (
    <section className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-[200px] flex-1 rounded-md" />
        <Skeleton className="h-9 w-[200px] rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
      <Skeleton className="h-7 w-72 rounded-md" />
    </section>
  );
}
