export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 h-4 w-32 animate-pulse rounded-md bg-muted/40" />
      <div className="h-96 animate-pulse rounded-xl border border-border/70 bg-card/50" />
    </div>
  );
}
