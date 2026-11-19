"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Parking } from "@/lib/parkings.schema";
import {
  DARK_TILE_FILTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  markerIcon,
} from "./leaflet-shared";

function MapSetup() {
  const map = useMap();
  useEffect(() => {
    map.getPane("tilePane")!.style.filter = DARK_TILE_FILTER;
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
  parking,
  position,
  closedLabel,
  label,
}: {
  parking: Parking;
  position: [number, number];
  closedLabel: string;
  label: string;
}) {
  const icon = useMemo(
    () => markerIcon(parking, closedLabel),
    [parking, closedLabel],
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
        <MapSetup />
        <Marker position={position} icon={icon} interactive={false} />
      </MapContainer>
    </div>
  );
}
