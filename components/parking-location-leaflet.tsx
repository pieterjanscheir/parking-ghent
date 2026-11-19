"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import type { RouteLine } from "@/lib/approach-routes";
import type { Parking } from "@/lib/parkings.schema";
import {
  extraMarkerIcon,
  markerIcon,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "./leaflet-shared";

// The app's accent blue, at a lightness that reads on the light map and on
// the darkened one.
const ROUTE_STYLE = { color: "oklch(0.62 0.19 262)", weight: 4, opacity: 0.85 } as const;

function MapSetup({ routes, position }: { routes: RouteLine[]; position: [number, number] }) {
  const map = useMap();
  const [lat, lng] = position;
  useEffect(() => {
    // With routes, show them whole: the point is how to get in from the ring.
    if (routes.length > 0) {
      map.fitBounds(L.latLngBounds([[lat, lng], ...routes.flat()]), {
        padding: [24, 24],
        maxZoom: 16,
        animate: false,
      });
    }
  }, [map, routes, lat, lng]);
  useEffect(() => {
    // The container gets its final size after mount (lazy load, layout
    // shift); keep Leaflet's idea of it in sync.
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// One garage on an OpenStreetMap map, with its live count on the marker.
// Loaded with `ssr: false` — see parking-location-map.tsx.
export default function ParkingLocationLeaflet({
  marker,
  position,
  closedLabel,
  label,
  routes,
}: {
  // A live garage, or a car park without a count ("P" / "P+R" on the pin).
  marker: Parking | { name: string; parkAndRide: boolean };
  position: [number, number];
  closedLabel: string;
  label: string;
  // The city's recommended streets between the ring road and this garage.
  routes: RouteLine[];
}) {
  const icon = useMemo(
    () =>
      "id" in marker
        ? markerIcon(marker, closedLabel)
        : extraMarkerIcon(marker.name, marker.parkAndRide),
    [marker, closedLabel],
  );
  // This map sits in the middle of a scrolling page. Scrolling the page with
  // the mouse wheel or one finger must not get stuck moving the map instead,
  // so wheel zoom is off, and on phones dragging is too (pinch-zoom and the
  // +/− buttons still work).
  const isPhone = L.Browser.mobile;

  return (
    <div role="group" aria-label={label}>
      <MapContainer
        center={position}
        zoom={16}
        scrollWheelZoom={false}
        dragging={!isPhone}
        className="h-[360px] w-full"
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} maxZoom={19} />
        <MapSetup routes={routes} position={position} />
        {routes.map((line, index) => (
          <Polyline key={index} positions={line} pathOptions={ROUTE_STYLE} interactive={false} />
        ))}
        {/* A label, not a control: `keyboard={false}` keeps it out of the tab
            order (by default Leaflet makes every marker a focusable button,
            even a non-interactive one). */}
        <Marker
          position={position}
          icon={icon}
          interactive={false}
          keyboard={false}
        />
      </MapContainer>
    </div>
  );
}
