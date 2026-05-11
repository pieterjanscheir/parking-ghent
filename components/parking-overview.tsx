"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { LayoutGrid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProfile } from "@/lib/profile";
import { useFavorites } from "@/lib/favorites";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import {
  SORT_KEYS,
  SORT_LABELS,
  filterParkings,
  sortParkings,
  uniqueTypes,
  type SortKey,
} from "@/lib/parkings";
import type { Parking } from "@/lib/parkings.schema";
import { OnboardingForm } from "./onboarding-form";
import { ParkingHeroCard } from "./parking-hero-card";
import { ParkingCard } from "./parking-card";
import { ParkingListView } from "./parking-list-view";
import {
  ParkingFilters,
  type ParkingFiltersValue,
} from "./parking-filters";
import { AutoRefreshControl } from "./auto-refresh-control";

type Props = {
  parkings: Parking[];
};

const VIEW_VALUES = ["cards", "list"] as const;

// Parsers must be module-scoped so they keep a stable reference across
// renders. Constructing them inside the component body would hand nuqs a
// fresh parser (and a fresh default `[]`) every render, churning every
// downstream useMemo that compares array references.
const SORT_PARSER = parseAsStringEnum([...SORT_KEYS]).withDefault("name-asc");
const VIEW_PARSER = parseAsStringEnum([...VIEW_VALUES]).withDefault("cards");
const ARRAY_PARSER = parseAsArrayOf(parseAsString).withDefault([]);
const Q_OPTIONS = { defaultValue: "", clearOnDefault: true } as const;

export function ParkingOverview({ parkings }: Props) {
  const router = useRouter();
  const { ready: profileReady, profile } = useProfile();
  const { ids: favoriteIds, ready: favReady } = useFavorites();

  const [q, setQ] = useQueryState("q", Q_OPTIONS);
  const [sort, setSort] = useQueryState<SortKey>("sort", SORT_PARSER);
  const [view, setView] = useQueryState("view", VIEW_PARSER);
  const [statusFilter, setStatusFilter] = useQueryState("status", ARRAY_PARSER);
  const [lezFilter, setLezFilter] = useQueryState("lez", ARRAY_PARSER);
  const [typeFilter, setTypeFilter] = useQueryState("type", ARRAY_PARSER);
  const [bucketFilter, setBucketFilter] = useQueryState("bucket", ARRAY_PARSER);

  const handleTick = useCallback(() => router.refresh(), [router]);
  const refresh = useAutoRefresh(handleTick);

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

  const { favorites, rest } = useMemo(() => {
    const favSet = new Set(favoriteIds);
    const favoritesInOrder = favoriteIds
      .map((id) => parkings.find((p) => p.id === id))
      .filter((p): p is Parking => Boolean(p));
    const others = parkings.filter((p) => !favSet.has(p.id));
    return { favorites: favoritesInOrder, rest: others };
  }, [parkings, favoriteIds]);

  const filteredRest = useMemo(() => {
    const filtered = filterParkings(rest, { q, ...filterValue });
    return sortParkings(filtered, sort);
  }, [rest, q, filterValue, sort]);

  if (!profileReady) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="h-64 animate-pulse rounded-xl bg-muted/30" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <OnboardingForm />
      </div>
    );
  }

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">
          Welcome back, {profile.firstName}
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Parkings in Ghent
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live availability across {parkings.length} parking structures.
        </p>
      </header>

      {favReady && favorites.length > 0 ? (
        <section className="mb-8">
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
              <ParkingHeroCard key={p.id} parking={p} />
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
              placeholder="Search by name…"
              value={q}
              onChange={(e) => setQ(e.target.value || null)}
              className="pl-9"
              aria-label="Search parkings by name"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as SortKey)}
          >
            <SelectTrigger size="sm" className="w-[200px]" aria-label="Sort by">
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
              if (v === "cards" || v === "list") setView(v);
            }}
            aria-label="View mode"
          >
            <ToggleGroupItem value="cards" aria-label="Card view">
              <LayoutGrid className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="size-3.5" />
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

      {filteredRest.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 rounded-xl border border-border/70 px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">No matches</p>
          <p className="text-sm text-muted-foreground">
            Try clearing your search or filters.
          </p>
        </div>
      ) : view === "list" ? (
        <ParkingListView
          parkings={filteredRest}
          sort={sort}
          onSortChange={(s) => setSort(s)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRest.map((p) => (
            <ParkingCard key={p.id} parking={p} />
          ))}
        </div>
      )}
    </div>
  );
}
