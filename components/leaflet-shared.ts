// Client-only: Leaflet touches `window` at import time, so this file may only
// be imported from map components that are loaded with `ssr: false`.
import L from "leaflet";
import type { Parking } from "@/lib/parkings.schema";
import { BUCKET_COLOR } from "./availability-gauge";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Standard OSM tiles are light; invert + rotate hue to fit the dark theme
// without depending on a keyed dark-tile provider.
export const DARK_TILE_FILTER =
  "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.85) saturate(0.4)";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// A pill with the live free-space count, coloured like the availability
// gauge, so the map answers "where is there space?" without any clicks.
export function markerIcon(p: Parking, closedLabel: string): L.DivIcon {
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
