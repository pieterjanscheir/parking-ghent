"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import L from "leaflet";
import { useLocale, useTranslations } from "next-intl";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { Parking } from "@/lib/parkings.schema";
import { FAST_CHARGER_KW, type ChargeStation } from "@/lib/chargers";
import { cn } from "@/lib/utils";
import { noteFor, type DirectoryEntry } from "@/lib/directory";
import type { Trend } from "@/lib/parking-history";
import { distanceKm, type LatLng } from "@/lib/geo";
import { Link } from "@/i18n/navigation";
import { distanceTo } from "@/lib/parkings";
import { dataAgeMs, isStale } from "@/lib/freshness";
import {
  DARK_TILE_FILTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  destinationIcon,
  extraMarkerIcon,
  markerIcon,
} from "./leaflet-shared";
import { forecastHint } from "./forecast-hint";
import { useFormatAge, useFormatDistance } from "./use-labels";

type Props = {
  parkings: Parking[];
  // Car parks without a live count, drawn as small "P" / "P+R" pins.
  extras: DirectoryEntry[];
  trendsById: Record<string, Trend>;
  userLocation: LatLng | null;
  // Where the visitor is heading, if they searched for a destination.
  destination: (LatLng & { name: string }) | null;
  // Current time, for judging how old each garage's count is.
  now: number;
  // The "Charge points" layer: every public charge point in the city.
  showChargers: boolean;
  onToggleChargers: (show: boolean) => void;
};

// Loaded once per visit, the first time the layer is switched on.
let stationsRequest: Promise<ChargeStation[]> | null = null;

function loadStations(): Promise<ChargeStation[]> {
  stationsRequest ??= fetch("/api/chargers")
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((json: { stations?: unknown }) =>
      (Array.isArray(json.stations) ? (json.stations as ChargeStation[]) : []).filter(
        (s) => typeof s?.lat === "number" && typeof s?.lng === "number",
      ),
    )
    .catch((err) => {
      // Let a later attempt try again.
      stationsRequest = null;
      throw err;
    });
  return stationsRequest;
}

function ChargerLayer() {
  const t = useTranslations("chargers");
  const tFacilities = useTranslations("facilities");
  const tDetail = useTranslations("detail");
  const [stations, setStations] = useState<ChargeStation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStations()
      .then((loaded) => {
        if (!cancelled) setStations(loaded);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (!stations) return null;
  return stations.map((station) => {
    const fast = station.maxKw !== null && station.maxKw >= FAST_CHARGER_KW;
    return (
      <CircleMarker
        key={`${station.lat},${station.lng}`}
        center={[station.lat, station.lng]}
        radius={fast ? 6.5 : 3.5}
        pathOptions={{
          color: "oklch(0.2 0.01 280)",
          weight: 1.5,
          fillColor: fast ? "oklch(0.75 0.17 55)" : "oklch(0.85 0.15 95)",
          fillOpacity: 0.95,
        }}
      >
        <Popup>
          <div className="space-y-1 text-sm">
            {station.street ? <p className="font-semibold">{station.street}</p> : null}
            <p>
              {station.maxKw !== null
                ? tFacilities("chargePointsKw", { count: station.count, kw: station.maxKw })
                : tFacilities("chargePoints", { count: station.count })}
            </p>
            {fast ? <p className="font-medium">{t("fast")}</p> : null}
            {station.operator ? (
              <p className="opacity-80">
                {tDetail("operator")}: {station.operator}
              </p>
            ) : null}
          </div>
        </Popup>
      </CircleMarker>
    );
  });
}

const GHENT: [number, number] = [51.0543, 3.7174];

function MapSetup({ points }: { points: [number, number][] }) {
  const map = useMap();
  // Re-fit only when the set of points actually changes (not on every
  // auto-refresh that produces an equal array).
  const key = points.map((p) => p.join(",")).join("|");
  const pointsRef = useRef(points);
  const interacted = useRef(false);

  useEffect(() => {
    pointsRef.current = points;
  });

  useEffect(() => {
    map.getPane("tilePane")!.style.filter = DARK_TILE_FILTER;
    const markInteracted = () => {
      interacted.current = true;
    };
    map.on("dragstart", markInteracted);
    const container = map.getContainer();
    container.addEventListener("wheel", markInteracted, { passive: true });
    container.addEventListener("touchstart", markInteracted, { passive: true });
    // The container gets its final size after mount (lazy load, layout
    // shift). Keep Leaflet in sync, and re-fit until the user takes over.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!interacted.current) fit(map, pointsRef.current);
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      map.off("dragstart", markInteracted);
      container.removeEventListener("wheel", markInteracted);
      container.removeEventListener("touchstart", markInteracted);
    };
  }, [map]);

  useEffect(() => {
    map.invalidateSize();
    fit(map, pointsRef.current);
  }, [map, key]);
  return null;
}

// How many of the closest garages the map frames around a destination.
const NEAREST_TO_SHOW = 4;

function fit(map: L.Map, points: [number, number][]) {
  if (points.length === 0) return;
  map.fitBounds(L.latLngBounds(points), {
    padding: [56, 56],
    maxZoom: 16,
    animate: false,
  });
}

export default function ParkingMap({
  parkings,
  extras,
  trendsById,
  userLocation,
  destination,
  now,
  showChargers,
  onToggleChargers,
}: Props) {
  const t = useTranslations("map");
  const tChargers = useTranslations("chargers");
  const tCommon = useTranslations("common");
  const tForecast = useTranslations("forecast");
  const tFresh = useTranslations("freshness");
  const tDestination = useTranslations("destination");
  const tExtras = useTranslations("extras");
  const locale = useLocale();
  const formatAge = useFormatAge();
  const formatDistance = useFormatDistance();
  const closedLabel = tCommon("closed");
  const located = useMemo(
    () => parkings.filter((p) => p.lat !== null && p.lng !== null),
    [parkings],
  );
  // Built once per data refresh, not on every clock tick: handing Leaflet a
  // new icon object makes it rebuild the marker's DOM.
  const icons = useMemo(
    () => new Map(located.map((p) => [p.id, markerIcon(p, closedLabel)])),
    [located, closedLabel],
  );
  const extraIcons = useMemo(
    () => new Map(extras.map((e) => [e.id, extraMarkerIcon(e.name, e.parkAndRide)])),
    [extras],
  );
  const destinationPin = useMemo(() => destinationIcon(), []);
  const bounds = useMemo(() => {
    // With a destination, zoom in on it and the few garages closest to it:
    // that is the choice being made. Otherwise show every garage.
    if (destination) {
      // Car parks without a count are on the map too, and may be the only
      // match for a search.
      const nearest = [
        ...located.map((p) => ({ lat: p.lat!, lng: p.lng! })),
        ...extras.map((e) => ({ lat: e.lat, lng: e.lng })),
      ]
        .map((point) => ({ point, km: distanceKm(destination, point) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAREST_TO_SHOW);
      return [
        ...nearest.map(({ point }): [number, number] => [point.lat, point.lng]),
        [destination.lat, destination.lng] as [number, number],
      ];
    }
    const pts: [number, number][] = located.map((p) => [p.lat!, p.lng!]);
    // When a search leaves only car parks without a count, frame those.
    if (pts.length === 0) for (const e of extras) pts.push([e.lat, e.lng]);
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts;
  }, [located, extras, userLocation, destination]);
  // Distances are measured from the destination when there is one.
  const origin = destination ?? userLocation;

  return (
    <div className="surface-card relative overflow-hidden rounded-xl border border-border/70">
      <button
        type="button"
        aria-pressed={showChargers}
        aria-label={tChargers("toggleLabel")}
        title={tChargers("toggleLabel")}
        onClick={() => onToggleChargers(!showChargers)}
        className={cn(
          "absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-md transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          showChargers
            ? "border-amber-300/60 bg-amber-300 text-black"
            : "border-border bg-card text-foreground hover:bg-muted",
        )}
      >
        <Zap className="size-3.5" aria-hidden />
        {tChargers("toggle")}
      </button>
      <MapContainer
        center={GHENT}
        zoom={13}
        scrollWheelZoom
        className="h-[min(70vh,640px)] w-full"
      >
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          url={OSM_TILE_URL}
          maxZoom={19}
        />
        <MapSetup points={bounds} />
        {showChargers ? <ChargerLayer /> : null}
        {destination ? (
          // Above the garage pills, so a garage right next to the
          // destination can't hide it.
          <Marker
            position={[destination.lat, destination.lng]}
            icon={destinationPin}
            zIndexOffset={1000}
            title={destination.name}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{destination.name}</p>
                <p className="opacity-80">{tDestination("marker")}</p>
              </div>
            </Popup>
          </Marker>
        ) : null}
        {userLocation && !destination ? (
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={7}
            pathOptions={{
              color: "white",
              weight: 2,
              fillColor: "oklch(0.6 0.155 273)",
              fillOpacity: 1,
            }}
          >
            <Popup>{t("youAreHere")}</Popup>
          </CircleMarker>
        ) : null}
        {extras.map((entry) => {
          const dist = origin ? distanceKm(origin, entry) : null;
          const note = noteFor(entry.note, locale);
          return (
            <Marker
              key={entry.id}
              position={[entry.lat, entry.lng]}
              icon={extraIcons.get(entry.id)!}
              // Below the live garages: a count is worth more than a "P".
              zIndexOffset={-500}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{entry.name}</p>
                  <p>
                    {tExtras("noLiveCount")}
                    {entry.capacity ? ` · ${tExtras("spaces", { count: entry.capacity })}` : ""}
                    {dist !== null
                      ? ` · ${
                          destination
                            ? formatDistance(dist, true)
                            : t("away", { distance: formatDistance(dist) })
                        }`
                      : ""}
                  </p>
                  {note ? <p className="opacity-80">{note}</p> : null}
                  <Link
                    href={`/parkings/${encodeURIComponent(entry.id)}`}
                    className="font-medium"
                  >
                    {t("viewDetails")}
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
        {located.map((p) => {
          const hint = forecastHint(p, trendsById[p.id] ?? null);
          const dist = distanceTo(p, origin);
          return (
            <Marker key={p.id} position={[p.lat!, p.lng!]} icon={icons.get(p.id)!}>
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{p.name}</p>
                  <p>
                    {!p.isOpen
                      ? closedLabel
                      : p.hasLiveData
                        ? t("freeOf", { free: p.freeSpaces, total: p.totalSpaces })
                        : t("unavailable")}
                    {dist !== null
                      ? ` · ${
                          destination
                            ? formatDistance(dist, true)
                            : t("away", { distance: formatDistance(dist) })
                        }`
                      : ""}
                  </p>
                  {isStale(p, now) ? (
                    <p className="font-medium">
                      ⚠{" "}
                      {tFresh("countLastUpdated", {
                        age: formatAge(dataAgeMs(p, now) ?? 0),
                      })}
                    </p>
                  ) : null}
                  {hint ? (
                    <p className="opacity-80">{tForecast(hint.key, hint.values)}</p>
                  ) : null}
                  <Link href={`/parkings/${encodeURIComponent(p.id)}`} className="font-medium">
                    {t("viewDetails")}
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
