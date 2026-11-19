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
import { BUCKET_COLOR } from "./availability-gauge";
import { forecastHint } from "./forecast-hint";
import { useFormatAge, useFormatDistance } from "./use-labels";

type Props = {
  parkings: Parking[];
  trendsById: Record<string, Trend>;
  userLocation: LatLng | null;
  // Current time, for judging how old each garage's count is.
  now: number;
};

const GHENT: [number, number] = [51.0543, 3.7174];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// A pill with the live free-space count, coloured like the availability
// gauge, so the map answers "where is there space?" without any clicks.
function markerIcon(p: Parking, closedLabel: string): L.DivIcon {
  const color = BUCKET_COLOR[p.bucket];
  const label = !p.isOpen ? closedLabel : p.hasLiveData ? String(p.freeSpaces) : "?";
  return L.divIcon({
    className: "parking-marker",
    html: `<span style="--marker-color:${color}" title="${escapeHtml(p.name)}">${escapeHtml(label)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });
}

// Standard OSM tiles are light; invert + rotate hue to fit the dark theme
// without depending on a keyed dark-tile provider.
const DARK_TILE_FILTER =
  "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.85) saturate(0.4)";

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

function fit(map: L.Map, points: [number, number][]) {
  if (points.length === 0) return;
  map.fitBounds(L.latLngBounds(points), {
    padding: [40, 40],
    maxZoom: 15,
    animate: false,
  });
}

export default function ParkingMap({ parkings, trendsById, userLocation, now }: Props) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const tForecast = useTranslations("forecast");
  const tFresh = useTranslations("freshness");
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
  const bounds = useMemo(() => {
    const pts: [number, number][] = located.map((p) => [p.lat!, p.lng!]);
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts;
  }, [located, userLocation]);

  return (
    <div className="surface-card overflow-hidden rounded-xl border border-border/70">
      <MapContainer
        center={GHENT}
        zoom={13}
        scrollWheelZoom
        className="h-[min(70vh,640px)] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapSetup points={bounds} />
        {userLocation ? (
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
          const dist = distanceTo(p, userLocation);
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
                      ? ` · ${t("away", { distance: formatDistance(dist) })}`
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
