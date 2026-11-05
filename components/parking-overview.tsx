"use client";

import { useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { toast } from "sonner";
import {
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
import { useGeolocation } from "@/lib/use-geolocation";
import {
  DEFAULT_SORT,
  SORT_KEYS,
  SORT_LABELS,
  distanceTo,
  filterParkings,
  isUsable,
  sortParkings,
  uniqueTypes,
  type SortKey,
} from "@/lib/parkings";
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

// Leaflet touches `window` at import time, so the map is client-only.
const ParkingMap = dynamic(() => import("./parking-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[min(70vh,640px)] w-full rounded-xl" />,
});

type Props = {
  parkings: Parking[];
  trendsById: Record<string, Trend>;
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

const NUMBER_FMT = new Intl.NumberFormat("en-GB");

export function ParkingOverview({ parkings, trendsById }: Props) {
  const router = useRouter();
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

  const handleTick = useCallback(() => router.refresh(), [router]);
  const refresh = useAutoRefresh(handleTick);

  // "Nearest to me" needs a location; ask for it as soon as that sort is
  // picked (including when it arrives via a shared URL).
  const { status: geoStatus, request: requestLocation } = geo;
  useEffect(() => {
    if (sort === "distance" && geoStatus === "idle") requestLocation();
  }, [sort, geoStatus, requestLocation]);
  useEffect(() => {
    if (geoStatus === "denied") {
      toast.error("Location access was denied — showing most free spaces instead.");
    } else if (geoStatus === "unavailable") {
      toast.error("Couldn't determine your location.");
    }
  }, [geoStatus]);

  const filterValue: ParkingFiltersValue = useMemo(
    () => ({
      status: statusFilter,
      lez: lezFilter,
      type: typeFilter,
      bucket: bucketFilter,
    }),
    [statusFilter, lezFilter, typeFilter, bucketFilter],
  );

  const typeOptions = useMemo(() => uniqueTypes(parkings), [parkings]);

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
    () => sortParkings(filterParkings(rest, filters), sort, geo.location),
    [rest, filters, sort, geo.location],
  );

  // The map shows everything that matches, favorites included.
  const filteredAll = useMemo(
    () => filterParkings(parkings, filters),
    [parkings, filters],
  );

  const distances = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const p of parkings) out[p.id] = distanceTo(p, geo.location);
    return out;
  }, [parkings, geo.location]);

  const updateFilters = (next: Partial<ParkingFiltersValue>) => {
    if (next.status !== undefined) setStatusFilter(next.status.length ? next.status : null);
    if (next.lez !== undefined) setLezFilter(next.lez.length ? next.lez : null);
    if (next.type !== undefined) setTypeFilter(next.type.length ? next.type : null);
    if (next.bucket !== undefined) setBucketFilter(next.bucket.length ? next.bucket : null);
  };

  const clearFilters = () => {
    setStatusFilter(null);
    setLezFilter(null);
    setTypeFilter(null);
    setBucketFilter(null);
  };

  const clearSearchAndFilters = () => {
    setQ(null);
    setOnlyAvailable(null);
    clearFilters();
  };

  const nearMe = () => {
    setSort("distance");
    if (geo.status !== "locating") geo.request();
  };

  const isEmpty = view === "map" ? filteredAll.length === 0 : filteredRest.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Where to park in Ghent
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live free spaces in the city&apos;s parking garages, with a short-term
          forecast so you know what to expect when you arrive.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label="Open now" value={`${summary.open} / ${parkings.length}`} />
          <SummaryStat label="With space" value={String(summary.usable)} />
          <SummaryStat label="Free spaces" value={NUMBER_FMT.format(summary.free)} />
          <SummaryStat
            label="Most space"
            value={summary.best ? summary.best.name : "—"}
            detail={summary.best ? `${summary.best.freeSpaces} free` : undefined}
          />
        </dl>
      </header>

      {favReady && favorites.length > 0 ? (
        <section className="mb-8" aria-label="Favorite parkings">
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
                distanceKm={distances[p.id]}
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
              placeholder="Search by name or street…"
              value={q}
              onChange={(e) => setQ(e.target.value || null)}
              className="pl-9"
              aria-label="Search parkings by name or street"
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
            Open with space
          </Button>
          <Button
            type="button"
            variant={sort === "distance" && geo.location ? "default" : "outline"}
            size="sm"
            onClick={nearMe}
            disabled={geo.status === "locating"}
            className="gap-1.5"
          >
            <LocateFixed className={cn("size-3.5", geo.status === "locating" && "motion-safe:animate-pulse")} />
            {geo.status === "locating" ? "Locating…" : "Near me"}
          </Button>
          <Select
            value={sort}
            onValueChange={(v) => {
              const next = v as SortKey;
              setSort(next === DEFAULT_SORT ? null : next);
            }}
          >
            <SelectTrigger size="sm" className="w-[190px]" aria-label="Sort by">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
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
            aria-label="View mode"
          >
            <ToggleGroupItem value="cards" aria-label="Card view">
              <LayoutGrid className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="map" aria-label="Map view">
              <MapIcon className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <AutoRefreshControl
          intervalMs={refresh.intervalMs}
          setInterval={refresh.setInterval}
          refreshNow={refresh.refreshNow}
          lastRefreshed={refresh.lastRefreshed}
          isRefreshing={refresh.isRefreshing}
        />
      </section>

      {parkings.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 rounded-xl border border-border/70 px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">
            Live data is temporarily unavailable
          </p>
          <p className="text-sm text-muted-foreground">
            The city&apos;s parking feed returned no garages. This usually
            resolves within a minute.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={refresh.refreshNow}>
            Try again
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="surface-card flex flex-col items-center gap-3 rounded-xl border border-border/70 px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">No matches</p>
          <p className="text-sm text-muted-foreground">
            Try clearing your search or filters.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSearchAndFilters}
          >
            Clear search and filters
          </Button>
        </div>
      ) : view === "map" ? (
        <ParkingMap
          parkings={filteredAll}
          trendsById={trendsById}
          userLocation={geo.location}
        />
      ) : view === "list" ? (
        <ParkingListView
          parkings={filteredRest}
          trendsById={trendsById}
          distances={distances}
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
              distanceKm={distances[p.id]}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Forecasts are available for the city-run garages that publish recent
        history. They extrapolate the last 20 minutes and are checked against
        the past few hours for each garage; treat them as a hint, not a
        guarantee.
      </p>
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
