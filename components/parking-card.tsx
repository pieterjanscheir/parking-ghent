import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Parking } from "@/lib/parkings.schema";
import { AvailabilityGauge } from "./availability-gauge";
import { FavoriteButton } from "./favorite-button";
import { ParkingStatusBadge, MetaBadge } from "./parking-status-badge";

export function ParkingCard({ parking }: { parking: Parking }) {
  return (
    <Link
      href={`/parkings/${encodeURIComponent(parking.id)}`}
      className="group/card surface-card relative flex flex-col gap-4 overflow-hidden rounded-xl border border-border/70 p-5 text-card-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 shadow-[0_1px_0_oklch(1_0_0/0.04)_inset] hover:shadow-[0_0_0_1px_oklch(0.66_0.19_258/0.25),0_18px_40px_-20px_oklch(0.66_0.19_258/0.45)] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-semibold leading-tight tracking-tight">
            {parking.name}
          </h3>
          {parking.address ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              <span className="truncate">{parking.address}</span>
            </p>
          ) : null}
        </div>
        <FavoriteButton parkingId={parking.id} size="sm" />
      </div>

      <div className="flex items-center gap-4">
        <AvailabilityGauge
          percent={parking.freePercent}
          bucket={parking.bucket}
          size="md"
        />
        <div className="flex flex-col">
          <span className="font-heading text-3xl font-bold leading-none tracking-tight tabular-nums">
            {parking.freeSpaces}
          </span>
          <span className="text-xs text-muted-foreground">
            of {parking.totalSpaces} free
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
    </Link>
  );
}
