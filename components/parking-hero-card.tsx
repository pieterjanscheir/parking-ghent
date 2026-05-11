import Link from "next/link";
import { MapPin, ChevronRight } from "lucide-react";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { AvailabilityGauge } from "./availability-gauge";
import { FavoriteButton } from "./favorite-button";
import { ParkingActions } from "./parking-actions";
import { ParkingStatusBadge, MetaBadge } from "./parking-status-badge";
import { TrendIndicator } from "./trend-indicator";

export function ParkingHeroCard({
  parking,
  trend,
}: {
  parking: Parking;
  trend: Trend | null;
}) {
  return (
    <Link
      href={`/parkings/${encodeURIComponent(parking.id)}`}
      className="group/card surface-card relative flex h-full flex-col gap-5 overflow-hidden rounded-xl border border-primary/40 bg-primary/[0.03] p-6 text-card-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 shadow-[0_1px_0_oklch(1_0_0/0.04)_inset] hover:shadow-[0_0_0_1px_oklch(0.66_0.19_258/0.35),0_24px_60px_-25px_oklch(0.66_0.19_258/0.55)] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/80 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 inline-flex items-center gap-1.5 rounded-4xl border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            Favorite
          </p>
          <h3 className="font-heading text-2xl font-bold leading-tight tracking-tight">
            {parking.name}
          </h3>
          {parking.address ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              <span className="truncate">{parking.address}</span>
            </p>
          ) : null}
        </div>
        <FavoriteButton parkingId={parking.id} size="md" />
      </div>

      <div className="flex items-center gap-5">
        <AvailabilityGauge
          percent={parking.freePercent}
          bucket={parking.bucket}
          size="lg"
        />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-heading text-5xl font-bold leading-none tracking-tight tabular-nums">
              {parking.freeSpaces}
            </span>
            {trend ? (
              <TrendIndicator
                trend={trend}
                currentFree={parking.freeSpaces}
                size="md"
              />
            ) : null}
          </div>
          <span className="mt-1 text-sm text-muted-foreground">
            free of {parking.totalSpaces}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ParkingStatusBadge parking={parking} />
        {parking.category ? (
          <MetaBadge>{parking.categoryLabel}</MetaBadge>
        ) : null}
        {parking.type ? <MetaBadge>{parking.typeLabel}</MetaBadge> : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <ParkingActions parking={parking} variant="compact" />
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          View details
          <ChevronRight className="size-4 transition-transform group-hover/card:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
