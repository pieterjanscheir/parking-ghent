import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { AvailabilityGauge } from "./availability-gauge";
import { FavoriteButton } from "./favorite-button";
import { DataWarning } from "./live-data-warning";
import { ParkingStatusBadge, MetaBadge } from "./parking-status-badge";
import { TrendIndicator } from "./trend-indicator";
import { ForecastHint } from "./forecast-hint";
import { useFormatDistance, useParkingLabels } from "./use-labels";

export function ParkingCard({
  parking,
  trend,
  now,
  distanceKm = null,
}: {
  parking: Parking;
  trend: Trend | null;
  // Current time, for judging how old this garage's count is.
  now: number;
  distanceKm?: number | null;
}) {
  const t = useTranslations("garage");
  const labels = useParkingLabels();
  const formatDistance = useFormatDistance();
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
              {distanceKm !== null && distanceKm !== undefined ? (
                <span className="shrink-0 text-foreground/80">· {formatDistance(distanceKm)}</span>
              ) : null}
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "font-heading text-3xl font-bold leading-none tracking-tight tabular-nums",
                !parking.hasLiveData && "text-muted-foreground",
              )}
            >
              {parking.hasLiveData ? parking.freeSpaces : "—"}
            </span>
            {parking.hasLiveData && trend ? (
              <TrendIndicator
                trend={trend}
                currentFree={parking.freeSpaces}
                size="sm"
              />
            ) : null}
            <DataWarning parking={parking} now={now} />
          </div>
          <span className="text-xs text-muted-foreground">
            {t("ofFree", { total: parking.totalSpaces })}
          </span>
          <ForecastHint parking={parking} trend={trend} className="mt-1" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ParkingStatusBadge parking={parking} />
        {parking.category ? (
          <MetaBadge>{labels.lez(parking)}</MetaBadge>
        ) : null}
        {parking.type ? <MetaBadge>{labels.type(parking)}</MetaBadge> : null}
      </div>
    </Link>
  );
}
