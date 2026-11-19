"use client";

import { useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { toast } from "sonner";
import {
  AlertTriangle,
  CircleCheck,
  LayoutGrid,
  List,
  LocateFixed,
  Map as MapIcon,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFavorites } from "@/lib/favorites";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { useNow, useSavedCopyAt } from "@/lib/use-now";
import { FEED_STALE_AFTER_MS, isStale, newestUpdate } from "@/lib/freshness";
import { useGeolocation } from "@/lib/use-geolocation";
import { distanceKm, formatLatLng, parseLatLng } from "@/lib/geo";
import type { Place } from "@/lib/destinations";
import {
  DEFAULT_SORT,
  SORT_KEYS,
  distanceTo,
  filterExtras,
  filterParkings,
  isUsable,
  sortExtras,
  sortParkings,
  uniqueTypes,
  type SortKey,
} from "@/lib/parkings";
import type { DirectoryEntry } from "@/lib/directory";
import { nearestParkAndRide, suggestGarage } from "@/lib/recommend";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { cn } from "@/lib/utils";
import { ParkingHeroCard } from "./parking-hero-card";
import { ParkingCard } from "./parking-card";
import { ParkingListView } from "./parking-list-view";
import {
  ParkingFilters,
  type ParkingFiltersValue,
} from "./parking-filters";
import { AutoRefreshControl } from "./auto-refresh-control";
import { DestinationAdvice } from "./destination-advice";
import { DestinationSearch } from "./destination-search";
import { ExtraParkingCard } from "./extra-parking-card";
import { ParkedBanner } from "./parked-here";
import { StreetZoneNote } from "./street-zone-note";
import { useFormatAge, useParkingLabels } from "./use-labels";

// Leaflet touches `window` at import time, so the map is client-only.
const ParkingMap = dynamic(() => import("./parking-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[min(70vh,640px)] w-full rounded-xl" />,
});

type Props = {
  parkings: Parking[];
  // Car parks without a live count: Park & Ride and privately run garages.
  extras: DirectoryEntry[];
  trendsById: Record<string, Trend>;
  // The server's clock when this data was rendered.
  serverNow: number;
};

const VIEW_VALUES = ["cards", "list", "map"] as const;

// Parsers must be module-scoped so they keep a stable reference across
// renders. Constructing them inside the component body would hand nuqs a
// fresh parser (and a fresh default `[]`) every render, churning every
// downstream useMemo that compares array references.
const SORT_PARSER = parseAsStringEnum([...SORT_KEYS]).withDefault(DEFAULT_SORT);
const VIEW_PARSER = parseAsStringEnum([...VIEW_VALUES]).withDefault("cards");
const ARRAY_PARSER = parseAsArrayOf(parseAsString).withDefault([]);
const BOOL_PARSER = parseAsBoolean.withDefault(false);
const Q_OPTIONS = { defaultValue: "", clearOnDefault: true } as const;

export function ParkingOverview({
  parkings,
  extras,
  trendsById: allTrendsById,
  serverNow,
}: Props) {
  const router = useRouter();
  const t = useTranslations("overview");
  const tSort = useTranslations("sort");
  const tCommon = useTranslations("common");
  const tDestination = useTranslations("destination");
  const tExtras = useTranslations("extras");
  const format = useFormatter();
  const formatAge = useFormatAge();
  const labels = useParkingLabels();
  const now = useNow(serverNow);
  const { ids: favoriteIds, ready: favReady } = useFavorites();
  const geo = useGeolocation();

  const [q, setQ] = useQueryState("q", Q_OPTIONS);
  const [sort, setSort] = useQueryState<SortKey>("sort", SORT_PARSER);
  const [view, setView] = useQueryState("view", VIEW_PARSER);
  const [onlyAvailable, setOnlyAvailable] = useQueryState("available", BOOL_PARSER);
  const [statusFilter, setStatusFilter] = useQueryState("status", ARRAY_PARSER);
  const [lezFilter, setLezFilter] = useQueryState("lez", ARRAY_PARSER);
  const [typeFilter, setTypeFilter] = useQueryState("type", ARRAY_PARSER);
  const [bucketFilter, setBucketFilter] = useQueryState("bucket", ARRAY_PARSER);
  const [featureFilter, setFeatureFilter] = useQueryState("has", ARRAY_PARSER);
  // The map's "Charge points" layer.
  const [showChargers, setShowChargers] = useQueryState("ev", BOOL_PARSER);
  // Where the visitor is heading. Kept in the URL (name + coordinates) so
  // "parking near Vooruit" can be shared or bookmarked.
  const [destName, setDestName] = useQueryState("dest", Q_OPTIONS);
  const [destAt, setDestAt] = useQueryState("at", Q_OPTIONS);
  const destination: Place | null = useMemo(() => {
    const point = parseLatLng(destAt);
    return point && destName
      ? { id: `dest-${destAt}`, name: destName, detail: "", ...point }
      : null;
  }, [destName, destAt]);
  // Distances are measured from the destination when there is one, otherwise
  // from the visitor's own location ("Near me").
  const origin = destination ?? geo.location;

  const handleTick = useCallback(() => router.refresh(), [router]);
  const refresh = useAutoRefresh(handleTick);

  // "Nearest to me" needs a location; ask for it as soon as that sort is
  // picked (including when it arrives via a shared URL).
  const { status: geoStatus, request: requestLocation } = geo;
  const hasDestination = destination !== null;
  useEffect(() => {
    if (sort === "distance" && geoStatus === "idle" && !hasDestination) {
      requestLocation();
    }
  }, [sort, geoStatus, requestLocation, hasDestination]);
  useEffect(() => {
    if (geoStatus === "denied") {
      toast.error(t("locationDenied"));
    } else if (geoStatus === "unavailable") {
      toast.error(t("locationUnavailable"));
    }
  }, [geoStatus, t]);

  const filterValue: ParkingFiltersValue = useMemo(
    () => ({
      status: statusFilter,
      lez: lezFilter,
      type: typeFilter,
      bucket: bucketFilter,
      features: featureFilter,
    }),
    [statusFilter, lezFilter, typeFilter, bucketFilter, featureFilter],
  );

  const typeOptions = uniqueTypes(parkings).map((option) => ({
    value: option.value,
    label: labels.type({ type: option.value, typeLabel: option.label }),
  }));

  // When the city's feed last moved at all. If that was a while ago the whole
  // page is showing old counts, however recently we asked.
  const dataUpdatedAt = useMemo(() => newestUpdate(parkings), [parkings]);
  const feedAgeMs = dataUpdatedAt === null ? null : Math.max(0, now - dataUpdatedAt);
  // On a copy saved for offline use the counts are old because the page is,
  // not because the city's feed stopped: the offline notice says so already.
  const isSavedCopy = useSavedCopyAt() !== null;
  const feedIsStale =
    !isSavedCopy && feedAgeMs !== null && feedAgeMs > FEED_STALE_AFTER_MS;

  // A forecast "in 30 min" anchored on an out-of-date count would mislead, so
  // garages with stale counts get no trend or forecast.
  const trendsById = useMemo(() => {
    const out: Record<string, Trend> = {};
    for (const p of parkings) {
      const trend = allTrendsById[p.id];
      if (trend && !isStale(p, now)) out[p.id] = trend;
    }
    return out;
  }, [parkings, allTrendsById, now]);

  const summary = useMemo(() => {
    const open = parkings.filter((p) => p.isOpen);
    const usable = parkings.filter(isUsable);
    const free = open
      .filter((p) => p.hasLiveData)
      .reduce((sum, p) => sum + p.freeSpaces, 0);
    const best = sortParkings(usable, "spaces-desc")[0] ?? null;
    return { open: open.length, usable: usable.length, free, best };
  }, [parkings]);

  const { favorites, rest } = useMemo(() => {
    const favSet = new Set(favoriteIds);
    const favoritesInOrder = favoriteIds
      .map((id) => parkings.find((p) => p.id === id))
      .filter((p): p is Parking => Boolean(p));
    const others = parkings.filter((p) => !favSet.has(p.id));
    return { favorites: favoritesInOrder, rest: others };
  }, [parkings, favoriteIds]);

  const filters = useMemo(
    () => ({ q, onlyAvailable, ...filterValue }),
    [q, onlyAvailable, filterValue],
  );

  const filteredRest = useMemo(
    () => sortParkings(filterParkings(rest, filters), sort, origin),
    [rest, filters, sort, origin],
  );

  // The map shows everything that matches, favorites included.
  const filteredAll = useMemo(
    () => filterParkings(parkings, filters),
    [parkings, filters],
  );

  const distances = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const p of parkings) out[p.id] = distanceTo(p, origin);
    for (const entry of extras) out[entry.id] = origin ? distanceKm(origin, entry) : null;
    return out;
  }, [parkings, extras, origin]);

  // The short answer for wherever distances are measured from: a destination
  // or the visitor's own location. It looks at every live garage, whatever
  // the search and filters below are set to.
  const advice = useMemo(() => {
    if (!origin) return null;
    const suggestion = suggestGarage(parkings, origin, trendsById, now);
    const ride = nearestParkAndRide(parkings, extras, origin, now);
    return {
      suggestion,
      // Not worth a second line when the suggestion is that Park & Ride.
      parkAndRide: ride && ride.id !== suggestion?.best.id ? ride : null,
    };
  }, [parkings, extras, origin, trendsById, now]);

  const filteredExtras = useMemo(
    () => sortExtras(filterExtras(extras, filters), origin),
    [extras, filters, origin],
  );

  const updateFilters = (next: Partial<ParkingFiltersValue>) => {
    if (next.status !== undefined) setStatusFilter(next.status.length ? next.status : null);
    if (next.lez !== undefined) setLezFilter(next.lez.length ? next.lez : null);
    if (next.type !== undefined) setTypeFilter(next.type.length ? next.type : null);
    if (next.bucket !== undefined) setBucketFilter(next.bucket.length ? next.bucket : null);
    if (next.features !== undefined) setFeatureFilter(next.features.length ? next.features : null);
  };

  const clearFilters = () => {
    setStatusFilter(null);
    setLezFilter(null);
    setTypeFilter(null);
    setBucketFilter(null);
    setFeatureFilter(null);
  };

  const clearSearchAndFilters = () => {
    setQ(null);
    setOnlyAvailable(null);
    clearFilters();
  };

  const chooseDestination = (place: Place) => {
    setDestName(place.name);
    setDestAt(formatLatLng(place));
    setSort("distance");
  };

  const clearDestination = () => {
    setDestName(null);
    setDestAt(null);
    // "Nearest" without a destination means "nearest to me"; don't spring a
    // location prompt on someone who only cleared a search.
    if (sort === "distance" && !geo.location) setSort(null);
  };

  const nearMe = () => {
    // "Near me" and a destination are two answers to the same question.
    setDestName(null);
    setDestAt(null);
    setSort("distance");
    if (geo.status !== "locating") geo.request();
  };

  // Nothing at all to show for this search: no live garage and no other car
  // park. (Favorites sit in their own section above and don't count here.)
  const liveIsEmpty = view === "map" ? filteredAll.length === 0 : filteredRest.length === 0;
  const isEmpty = liveIsEmpty && filteredExtras.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
        <div className="mt-5 max-w-xl">
          <DestinationSearch
            selected={destination}
            onSelect={chooseDestination}
            onClear={clearDestination}
          />
          {destination && sort === "distance" ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {tDestination("sortedNote", { place: destination.name })}
            </p>
          ) : null}
          {advice ? (
            <DestinationAdvice
              place={destination?.name ?? null}
              suggestion={advice.suggestion}
              parkAndRide={advice.parkAndRide}
            >
              {destination ? (
                <StreetZoneNote place={destination.name} at={destination} />
              ) : null}
            </DestinationAdvice>
          ) : null}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label={t("stats.openNow")} value={`${summary.open} / ${parkings.length}`} />
          <SummaryStat label={t("stats.withSpace")} value={String(summary.usable)} />
          <SummaryStat label={t("stats.freeSpaces")} value={format.number(summary.free)} />
          <SummaryStat
            label={t("stats.mostSpace")}
            value={summary.best ? summary.best.name : "—"}
            detail={
              summary.best
                ? t("stats.mostSpaceDetail", { count: summary.best.freeSpaces })
                : undefined
            }
          />
        </dl>
      </header>

      <ParkedBanner />

      {feedIsStale ? (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
          <p>
            <span className="font-semibold">
              {t("feedStopped", { age: formatAge(feedAgeMs) })}
            </span>{" "}
            {t("feedStoppedDetail")}
          </p>
        </div>
      ) : null}

      {favReady && favorites.length > 0 ? (
        <section className="mb-8" aria-label={t("favorites")}>
          <div
            className={
              favorites.length === 1
                ? "grid grid-cols-1 gap-4"
                : favorites.length === 2
                  ? "grid grid-cols-1 gap-4 md:grid-cols-2"
                  : "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            }
          >
            {favorites.map((p) => (
              <ParkingHeroCard
                key={p.id}
                parking={p}
                trend={trendsById[p.id] ?? null}
                now={now}
                distanceKm={distances[p.id]}
                walking={hasDestination}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value || null)}
              className="pl-9"
              aria-label={t("searchLabel")}
            />
          </div>
          <Button
            type="button"
            variant={onlyAvailable ? "default" : "outline"}
            size="sm"
            aria-pressed={onlyAvailable}
            onClick={() => setOnlyAvailable(onlyAvailable ? null : true)}
            className="gap-1.5"
          >
            <CircleCheck className="size-3.5" />
            {t("openWithSpace")}
          </Button>
          <Button
            type="button"
            variant={
              sort === "distance" && geo.location && !destination
                ? "default"
                : "outline"
            }
            size="sm"
            onClick={nearMe}
            disabled={geo.status === "locating"}
            className="gap-1.5"
          >
            <LocateFixed className={cn("size-3.5", geo.status === "locating" && "motion-safe:animate-pulse")} />
            {geo.status === "locating" ? t("locating") : t("nearMe")}
          </Button>
          <Select
            value={sort}
            onValueChange={(v) => {
              const next = v as SortKey;
              setSort(next === DEFAULT_SORT ? null : next);
            }}
          >
            <SelectTrigger size="sm" className="w-[210px]" aria-label={t("sortBy")}>
              <SelectValue placeholder={t("sortBy")} />
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {key === "distance" && destination
                    ? tDestination("nearestToDestination")
                    : tSort(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ParkingFilters
            value={filterValue}
            onChange={updateFilters}
            typeOptions={typeOptions}
            onClear={clearFilters}
          />
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => {
              if (v === "cards" || v === "list" || v === "map") {
                setView(v === "cards" ? null : v);
              }
            }}
            aria-label={t("viewMode")}
          >
            <ToggleGroupItem value="cards" aria-label={t("viewCards")}>
              <LayoutGrid className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label={t("viewList")}>
              <List className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="map" aria-label={t("viewMap")}>
              <MapIcon className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <AutoRefreshControl
          intervalMs={refresh.intervalMs}
          setInterval={refresh.setInterval}
          refreshNow={refresh.refreshNow}
          isRefreshing={refresh.isRefreshing}
          dataUpdatedAt={dataUpdatedAt}
          now={now}
        />
      </section>

      {parkings.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 rounded-xl border border-border/70 px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">
            {t("noDataTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("noDataBody")}</p>
          <Button type="button" variant="outline" size="sm" onClick={refresh.refreshNow}>
            {tCommon("tryAgain")}
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="surface-card flex flex-col items-center gap-3 rounded-xl border border-border/70 px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">
            {t("noMatchesTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("noMatchesBody")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSearchAndFilters}
          >
            {t("clearSearchAndFilters")}
          </Button>
        </div>
      ) : view === "map" ? (
        <ParkingMap
          parkings={filteredAll}
          extras={filteredExtras}
          trendsById={trendsById}
          userLocation={geo.location}
          destination={destination}
          now={now}
          showChargers={showChargers}
          onToggleChargers={(show) => setShowChargers(show ? true : null)}
        />
      ) : liveIsEmpty ? null : view === "list" ? (
        <ParkingListView
          parkings={filteredRest}
          trendsById={trendsById}
          distances={distances}
          walking={hasDestination}
          now={now}
          sort={sort}
          onSortChange={(s) => setSort(s === DEFAULT_SORT ? null : s)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRest.map((p) => (
            <ParkingCard
              key={p.id}
              parking={p}
              trend={trendsById[p.id] ?? null}
              now={now}
              distanceKm={distances[p.id]}
              walking={hasDestination}
            />
          ))}
        </div>
      )}

      {view !== "map" && filteredExtras.length > 0 ? (
        <section className="mt-10" aria-labelledby="extras-heading">
          <h2 id="extras-heading" className="font-heading text-lg font-semibold tracking-tight">
            {tExtras("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{tExtras("intro")}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredExtras.map((entry) => (
              <ExtraParkingCard
                key={entry.id}
                entry={entry}
                distanceKm={distances[entry.id]}
                walking={hasDestination}
              />
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-8 text-xs text-muted-foreground">{t("forecastNote")}</p>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="surface-card min-w-0 rounded-lg border border-border/70 px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-heading text-lg font-semibold tabular-nums">
        {value}
        {detail ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
