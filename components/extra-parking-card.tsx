import { ChevronRight, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { noteFor, type DirectoryEntry } from "@/lib/directory";
import { FacilityBadges } from "./facility-badges";
import { useFormatDistance } from "./use-labels";

// A car park the city lists but that publishes no live count: a Park & Ride
// or a privately run garage. Smaller than the live cards on purpose — there
// is no number to show.
export function ExtraParkingCard({
  entry,
  distanceKm = null,
  walking = false,
}: {
  entry: DirectoryEntry;
  distanceKm?: number | null;
  // The distance is to the visitor's destination: show walking time too.
  walking?: boolean;
}) {
  const t = useTranslations("extras");
  const locale = useLocale();
  const formatDistance = useFormatDistance();
  const note = noteFor(entry.note, locale);
  return (
    <Link
      href={`/parkings/${encodeURIComponent(entry.id)}`}
      className="group/card surface-card flex flex-col gap-2.5 rounded-xl border border-border/70 p-4 text-card-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-sm font-semibold leading-tight tracking-tight">
          {entry.name}
        </h3>
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5"
          aria-hidden
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        <MapPin className="size-3 shrink-0" aria-hidden />
        {entry.address ? <span>{entry.address}</span> : null}
        {distanceKm !== null ? (
          <span className="text-foreground/80">
            {entry.address ? "· " : null}
            {formatDistance(distanceKm, walking)}
          </span>
        ) : null}
      </p>
      {note ? <p className="line-clamp-2 text-xs text-muted-foreground">{note}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <FacilityBadges
          parkAndRide={entry.parkAndRide}
          isFree={entry.isFree}
          evChargers={entry.evChargers}
        />
        {entry.capacity ? (
          <span className="inline-flex items-center rounded-4xl border border-border/60 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
            {t("spaces", { count: entry.capacity })}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
