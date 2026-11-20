"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { drivingRouteUrl } from "@/lib/route-link";
import type { CityMapProps } from "./city-map";
import { extraMarkerIcon, markerIcon, OSM_ATTRIBUTION, OSM_TILE_URL } from "./leaflet-shared";

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  // The counts refresh every minute and arrive as new lists. The view is
  // only fitted again when a car park's place changed, so a refresh never
  // undoes the visitor's own zoom or pan.
  const where = points.map(([lat, lng]) => `${lat},${lng}`).join(";");
  useEffect(() => {
    const spots = where.split(";").map((spot) => spot.split(",").map(Number) as [number, number]);
    if (spots.length > 1) {
      map.fitBounds(L.latLngBounds(spots), { padding: [28, 28], maxZoom: 15, animate: false });
    }
  }, [map, where]);
  useEffect(() => {
    // The container gets its final size after mount; keep Leaflet in sync.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Every car park of one city on an OpenStreetMap map: a pill with the live
// count where there is one, "P" or "P+R" where there isn't. Loaded with
// `ssr: false` — see city-map.tsx.
export default function CityMapLeaflet({
  parkings,
  extras,
  center,
  label,
  closedLabel,
  routeLabel,
  noCountLabel,
  freeOf,
}: CityMapProps) {
  const live = useMemo(() => parkings.filter((p) => p.lat !== null && p.lng !== null), [parkings]);
  const points = useMemo<[number, number][]>(
    () => [...live.map((p): [number, number] => [p.lat!, p.lng!]), ...extras.map((e): [number, number] => [e.lat, e.lng])],
    [live, extras],
  );
  // The map sits in a scrolling page: the mouse wheel and, on phones, one
  // finger must scroll the page, not get stuck moving the map.
  const isPhone = L.Browser.mobile;
  const popupLink = "font-medium text-primary underline-offset-4 hover:underline";

  return (
    <div role="group" aria-label={label}>
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} dragging={!isPhone} className="h-[420px] w-full">
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} maxZoom={19} />
        <FitAll points={points} />
        {extras.map((e) => (
          <Marker key={`extra-${e.id}`} position={[e.lat, e.lng]} icon={extraMarkerIcon(e.name, e.parkAndRide)}>
            <Popup>
              <strong>{e.name}</strong>
              <br />
              {noCountLabel}
              <br />
              <a className={popupLink} href={drivingRouteUrl(e.lat, e.lng)} target="_blank" rel="noopener noreferrer">
                {routeLabel}
              </a>
            </Popup>
          </Marker>
        ))}
        {live.map((p) => (
          <Marker key={`live-${p.id}`} position={[p.lat!, p.lng!]} icon={markerIcon(p, closedLabel)} zIndexOffset={500}>
            <Popup>
              <strong>{p.name}</strong>
              <br />
              {!p.isOpen ? closedLabel : (freeOf[p.id] ?? noCountLabel)}
              <br />
              <a className={popupLink} href={drivingRouteUrl(p.lat!, p.lng!)} target="_blank" rel="noopener noreferrer">
                {routeLabel}
              </a>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
