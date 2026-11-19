"use client";

import { useCallback } from "react";
import type { Place } from "./destinations";
import { formatLatLng, parseLatLng } from "./geo";
import { useLocalStorageJson } from "./local-storage-store";

// The last few destinations a visitor picked, so "Vooruit" is one tap away
// next time. Kept in this browser only (localStorage), never sent anywhere.
const STORAGE_KEY = "parking.destinations.v1";
export const MAX_RECENT = 4;

export function parseRecent(raw: string): Place[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const places: Place[] = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null) continue;
      const v = item as Record<string, unknown>;
      if (typeof v.name !== "string" || !v.name.trim()) continue;
      if (typeof v.lat !== "number" || typeof v.lng !== "number") continue;
      // Same rule as a destination in a shared link: a point in or around Ghent.
      const point = parseLatLng(formatLatLng({ lat: v.lat, lng: v.lng }));
      if (!point) continue;
      places.push({
        // Position in the list included: two entries can share a position.
        id: `recent-${places.length}-${formatLatLng(point)}`,
        name: v.name.trim().slice(0, 120),
        detail: typeof v.detail === "string" ? v.detail.slice(0, 200) : "",
        ...point,
      });
      if (places.length === MAX_RECENT) break;
    }
    return places;
  } catch {
    return null;
  }
}

// `place` moved to the front; a place already in the list isn't listed twice.
export function withRecent(list: Place[], place: Place): Place[] {
  // Name and position: two streets in different boroughs can share a name.
  const key = (p: Place) => `${p.name.trim().toLowerCase()}|${formatLatLng(p)}`;
  return [place, ...list.filter((p) => key(p) !== key(place))].slice(0, MAX_RECENT);
}

export function useRecentDestinations(): {
  recent: Place[];
  remember: (place: Place) => void;
  forget: () => void;
} {
  const { value, write } = useLocalStorageJson(STORAGE_KEY, parseRecent);
  const recent = value ?? EMPTY;
  const remember = useCallback(
    (place: Place) =>
      write(
        // Only what is needed to offer it again.
        withRecent(recent, place).map(({ name, detail, lat, lng }) => ({
          id: "",
          name,
          detail,
          lat,
          lng,
        })),
      ),
    [recent, write],
  );
  const forget = useCallback(() => write(null), [write]);
  return { recent, remember, forget };
}

const EMPTY: Place[] = [];
