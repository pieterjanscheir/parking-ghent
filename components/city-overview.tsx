"use client";

// A client component: the stale-count warning it shows per car park has a
// tooltip with handlers, which can't be rendered from the server.
import { ExternalLink, MapPin, Navigation2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CityInfo } from "@/lib/cities/info";
import { byFreeSpaces, citySummary } from "@/lib/cities/pages";
import type { DirectoryEntry } from "@/lib/directory";
import { newestUpdate } from "@/lib/freshness";
import type { Parking } from "@/lib/parkings.schema";
import { drivingRouteUrl } from "@/lib/route-link";
import { cn } from "@/lib/utils";
import { AvailabilityGauge } from "./availability-gauge";
import { CityMap } from "./city-map";
import { CityNav } from "./city-nav";
import { CityRefresh } from "./city-refresh";
import { FacilityBadges } from "./facility-badges";
import { DataWarning } from "./live-data-warning";
import { MetaBadge, ParkingStatusBadge } from "./parking-status-badge";
import { useFormatAge, useFormatTime } from "./use-labels";

const CARD = "surface-card flex flex-col gap-3 rounded-xl border border-border/70 p-4 text-card-foreground";
const ACTION =
  "inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

// The two links every car park gets: how to drive there, and the page of
// whoever runs it, where there is one.
function CardLinks({ name, lat, lng, url }: { name: string; lat: number | null; lng: number | null; url: string | null }) {
  const t = useTranslations("cities");
  if ((lat === null || lng === null) && !url) return null;
  return (
    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
      {lat !== null && lng !== null ? (
        <a className={ACTION} href={drivingRouteUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
          <Navigation2 className="size-3" aria-hidden />
          {t("route")}
          <span className="sr-only">: {name}</span>
        </a>
      ) : null}
      {url ? (
        <a className={ACTION} href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3" aria-hidden />
          {t("website")}
          <span className="sr-only">: {name}</span>
        </a>
      ) : null}
    </div>
  );
}

function Address({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="inline-flex items-start gap-1 text-xs text-muted-foreground">
      <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

function LiveCard({ parking, now, knowsParkAndRide }: { parking: Parking; now: number; knowsParkAndRide: boolean }) {
  const t = useTranslations("garage");
  return (
    <li className={CARD}>
      <div>
        <h3 className="font-heading text-sm font-semibold leading-tight tracking-tight">{parking.name}</h3>
        <Address text={parking.address} />
      </div>
      <div className="flex items-center gap-4">
        <AvailabilityGauge percent={parking.freePercent} bucket={parking.bucket} size="md" />
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
            <DataWarning parking={parking} now={now} />
          </div>
          {parking.totalSpaces > 0 ? (
            <span className="text-xs text-muted-foreground">{t("ofFree", { total: parking.totalSpaces })}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ParkingStatusBadge parking={parking} />
        <FacilityBadges parkAndRide={knowsParkAndRide && parking.parkAndRide} isFree={null} evChargers={0} />
      </div>
      <CardLinks name={parking.name} lat={parking.lat} lng={parking.lng} url={parking.websiteUrl || null} />
    </li>
  );
}

function ListCard({ entry, knowsParkAndRide }: { entry: DirectoryEntry; knowsParkAndRide: boolean }) {
  const t = useTranslations("extras");
  return (
    <li className={CARD}>
      <div>
        <h3 className="font-heading text-sm font-semibold leading-tight tracking-tight">{entry.name}</h3>
        <Address text={entry.address} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FacilityBadges
          parkAndRide={knowsParkAndRide && entry.parkAndRide}
          isFree={entry.isFree}
          evChargers={entry.evChargers}
        />
        {entry.capacity ? <MetaBadge>{t("spaces", { count: entry.capacity })}</MetaBadge> : null}
        <MetaBadge>{t("noLiveCount")}</MetaBadge>
      </div>
      <CardLinks name={entry.name} lat={entry.lat} lng={entry.lng} url={entry.url} />
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const format = useFormatter();
  return (
    <div className="surface-card rounded-xl border border-border/70 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-heading text-xl font-semibold tabular-nums">{format.number(value)}</dd>
    </div>
  );
}

// One city other than Ghent: its car parks on a map and as cards, with live
// counts where the city has them. Ghent's own overview is far richer
// (components/parking-overview.tsx); this page shows what every city has.
export function CityOverview({
  city,
  parkings,
  extras,
  now,
}: {
  city: Pick<CityInfo, "id" | "center" | "publisher" | "openData" | "knows">;
  parkings: Parking[];
  extras: DirectoryEntry[];
  // The server's clock when the data was fetched.
  now: number;
}) {
  const t = useTranslations("cities");
  const tCommon = useTranslations("common");
  const tExtras = useTranslations("extras");
  const tMap = useTranslations("map");
  const tFreshness = useTranslations("freshness");
  const formatAge = useFormatAge();
  const formatTime = useFormatTime();
  const name = t(`names.${city.id}`);
  const live = city.knows.liveCounts;
  const sorted = byFreeSpaces(parkings, now);
  const summary = citySummary(parkings, now);
  const updatedAt = newestUpdate(parkings);
  const freeOf = Object.fromEntries(
    parkings
      .filter((p) => p.hasLiveData)
      .map((p) => [p.id, tMap("freeOf", { free: p.freeSpaces, total: p.totalSpaces })]),
  );
  const heading = "font-heading text-lg font-semibold tracking-tight";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      {live ? <CityRefresh /> : null}
      <CityNav current={city.id} />
      <h1 className="mt-6 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t("title", { city: name })}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        {live ? t("introLive", { city: name }) : t("introList", { city: name })}
      </p>

      {live ? (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("statCarParks")} value={summary.carParks} />
            <Stat label={t("statOpen")} value={summary.open} />
            <Stat label={t("statWithSpace")} value={summary.withSpace} />
            <Stat label={t("statFreeSpaces")} value={summary.freeSpaces} />
          </dl>
          {updatedAt !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {tFreshness("cityDataUpdated", { age: formatAge(now - updatedAt), time: formatTime(updatedAt) })}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="mt-6">
        <CityMap
          parkings={parkings}
          extras={extras}
          center={[city.center.lat, city.center.lng]}
          label={t("mapLabel", { city: name })}
          closedLabel={tCommon("closed")}
          routeLabel={t("route")}
          noCountLabel={tExtras("noLiveCount")}
          freeOf={freeOf}
        />
      </div>

      {sorted.length > 0 ? (
        <section aria-labelledby="city-live" className="mt-10">
          <h2 id="city-live" className={heading}>
            {t("liveTitle")}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <LiveCard key={p.id} parking={p} now={now} knowsParkAndRide={city.knows.parkAndRide} />
            ))}
          </ul>
        </section>
      ) : null}

      {extras.length > 0 ? (
        <section aria-labelledby="city-list" className="mt-10">
          <h2 id="city-list" className={heading}>
            {live ? t("listTitleBeside") : t("listTitle", { count: extras.length })}
          </h2>
          {live ? <p className="mt-1 text-sm text-muted-foreground">{tExtras("intro")}</p> : null}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {extras.map((e) => (
              <ListCard key={e.id} entry={e} knowsParkAndRide={city.knows.parkAndRide} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 space-y-1.5 text-xs text-muted-foreground">
        <p>{t("source", { publisher: city.publisher })}</p>
        {city.openData ? null : <p>{t("notOpenData", { city: name })}</p>}
        <p>{t("ghentOnly", { city: name })}</p>
      </div>
    </div>
  );
}
