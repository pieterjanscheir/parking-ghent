import { ChevronLeft, ExternalLink, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { RouteLine } from "@/lib/approach-routes";
import type { DirectoryEntry } from "@/lib/directory";
import { Button } from "@/components/ui/button";
import { FacilityBadges } from "./facility-badges";
import { OnwardTravel } from "./onward-travel";
import { ParkedHere } from "./parked-here";
import { ParkingActions } from "./parking-actions";
import { ParkingFacilities } from "./parking-facilities";
import { ParkingLocationMap } from "./parking-location-map";
import { MetaBadge } from "./parking-status-badge";

// The page of a car park that publishes no live count (a Park & Ride or a
// privately run garage): where it is, how big, how to get there.
export function ExtraParkingDetail({
  entry,
  routes = [],
}: {
  entry: DirectoryEntry;
  routes?: RouteLine[];
}) {
  const t = useTranslations("extras");
  const tCommon = useTranslations("common");
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> {tCommon("backToOverview")}
      </Link>

      <div className="surface-card rounded-xl border border-border/70 p-6 sm:p-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{entry.name}</h1>
        {entry.address ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            {entry.address}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          <MetaBadge>{t("noLiveCount")}</MetaBadge>
          <FacilityBadges
            parkAndRide={entry.parkAndRide}
            isFree={entry.isFree}
            evChargers={entry.evChargers}
          />
        </div>

        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("detailLead")}
        </p>

        {entry.capacity ? (
          <p className="mt-6">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("capacity")}
            </span>
            <span className="mt-1 block font-heading text-3xl font-bold leading-none tracking-tight tabular-nums">
              {t("spaces", { count: entry.capacity })}
            </span>
          </p>
        ) : null}

        <ParkingActions
          parking={{
            id: entry.id,
            name: entry.name,
            lat: entry.lat,
            lng: entry.lng,
            phone: null,
            shareText: t("shareText"),
          }}
          variant="full"
          className="mt-8"
        />
        <ParkedHere
          place={{ id: entry.id, name: entry.name, lat: entry.lat, lng: entry.lng }}
          className="mt-4"
        />

        <ParkingFacilities
          parkAndRide={entry.parkAndRide}
          isFree={entry.isFree}
          evChargers={entry.evChargers}
          evMaxKw={entry.evMaxKw}
          note={entry.note}
        />

        {entry.parkAndRide ? <OnwardTravel lat={entry.lat} lng={entry.lng} /> : null}

        {entry.url ? (
          <div className="mt-8">
            <Button asChild variant="outline" className="gap-1.5">
              <a href={entry.url} target="_blank" rel="noopener noreferrer">
                {t("moreInfo")}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      <ParkingLocationMap
        parking={{ name: entry.name, lat: entry.lat, lng: entry.lng }}
        plainMarker={{ parkAndRide: entry.parkAndRide }}
        routes={routes}
      />
    </div>
  );
}
