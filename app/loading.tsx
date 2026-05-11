export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted/40" />
        <div className="h-9 w-72 animate-pulse rounded-md bg-muted/40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-xl border border-border/70 bg-card/50"
          />
        ))}
      </div>
    </div>
  );
}
