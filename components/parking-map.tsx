"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useTranslations } from "next-intl";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import type { LatLng } from "@/lib/geo";
import { Link } from "@/i18n/navigation";
import { distanceTo } from "@/lib/parkings";
import { dataAgeMs, isStale } from "@/lib/freshness";
import {
  DARK_TILE_FILTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  destinationIcon,
  markerIcon,
} from "./leaflet-shared";
import { forecastHint } from "./forecast-hint";
import { useFormatAge, useFormatDistance } from "./use-labels";

type Props = {
  parkings: Parking[];
  trendsById: Record<string, Trend>;
  userLocation: LatLng | null;
  // Where the visitor is heading, if they searched for a destination.
  destination: (LatLng & { name: string }) | null;
  // Current time, for judging how old each garage's count is.
  now: number;
};

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
  trendsById,
  userLocation,
  destination,
  now,
}: Props) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const tForecast = useTranslations("forecast");
  const tFresh = useTranslations("freshness");
  const tDestination = useTranslations("destination");
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
  const destinationPin = useMemo(() => destinationIcon(), []);
  const bounds = useMemo(() => {
    // With a destination, zoom in on it and the few garages closest to it:
    // that is the choice being made. Otherwise show every garage.
    if (destination) {
      const nearest = [...located]
        .sort(
          (a, b) =>
            (distanceTo(a, destination) ?? Infinity) -
            (distanceTo(b, destination) ?? Infinity),
        )
        .slice(0, NEAREST_TO_SHOW);
      return [
        ...nearest.map((p): [number, number] => [p.lat!, p.lng!]),
        [destination.lat, destination.lng] as [number, number],
      ];
    }
    const pts: [number, number][] = located.map((p) => [p.lat!, p.lng!]);
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts;
  }, [located, userLocation, destination]);
  // Distances are measured from the destination when there is one.
  const origin = destination ?? userLocation;

  return (
    <div className="surface-card overflow-hidden rounded-xl border border-border/70">
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
