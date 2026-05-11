import { cn } from "@/lib/utils";
import type { Parking } from "@/lib/parkings.schema";

export function ParkingStatusBadge({ parking }: { parking: Parking }) {
  const isOpen = parking.isOpen;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs font-medium",
        isOpen
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          isOpen ? "bg-primary" : "bg-destructive",
        )}
      />
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

export function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-4xl border border-border/60 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
