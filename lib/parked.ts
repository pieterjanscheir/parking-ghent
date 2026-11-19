"use client";

import { useCallback } from "react";
import { useLocalStorageJson } from "./local-storage-store";

// "Where did I park?" — the car park the visitor says they left their car
// in, or the spot on the street they saved, with the time and an optional
// note ("level -2, row C"). It lives in this browser only (localStorage).
export type ParkedSpot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  // When they said so, by this device's clock (epoch ms).
  at: number;
  note: string;
};

const STORAGE_KEY = "parking.parked.v1";

// A spot on the street, saved from the phone's position, has no car park
// behind it: it goes by this id, and its `name` is not shown.
export const STREET_SPOT_ID = "street";
export const isStreetSpot = (spot: Pick<ParkedSpot, "id">) => spot.id === STREET_SPOT_ID;
export const NOTE_MAX_LENGTH = 60;
// A car isn't left in a garage for weeks on a city trip: after this long the
// reminder is more likely forgotten than still true.
export const FORGET_AFTER_MS = 7 * 24 * 60 * 60_000;

export function parseParkedSpot(raw: string): ParkedSpot | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;
    if (
      typeof v.id !== "string" ||
      v.id === "" ||
      typeof v.name !== "string" ||
      v.name === "" ||
      typeof v.lat !== "number" ||
      typeof v.lng !== "number" ||
      typeof v.at !== "number" ||
      !Number.isFinite(v.lat) ||
      !Number.isFinite(v.lng) ||
      !Number.isFinite(v.at)
    ) {
      return null;
    }
    return {
      id: v.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      at: v.at,
      note: typeof v.note === "string" ? v.note.slice(0, NOTE_MAX_LENGTH) : "",
    };
  } catch {
    return null;
  }
}

// Still worth showing? Not when it is very old, or dated in the future (a
// clock that was changed since).
export function isCurrent(spot: ParkedSpot, now: number): boolean {
  return spot.at <= now + 60_000 && now - spot.at < FORGET_AFTER_MS;
}

// A walking route back to the car, from wherever the visitor is.
export function walkingRouteUrl(spot: Pick<ParkedSpot, "lat" | "lng">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat}%2C${spot.lng}&travelmode=walking`;
}

type Place = { id: string; name: string; lat: number; lng: number };

export function useParkedSpot(): {
  spot: ParkedSpot | null;
  // False during server render and hydration, when the stored value isn't
  // known yet.
  ready: boolean;
  // `note` carries an existing note over when the same car's spot is moved.
  park: (place: Place, note?: string) => void;
  setNote: (note: string) => void;
  clear: () => void;
} {
  const { value, mounted, write } = useLocalStorageJson(STORAGE_KEY, parseParkedSpot);
  const park = useCallback(
    (place: Place, note = "") =>
      write({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        at: Date.now(),
        note: note.slice(0, NOTE_MAX_LENGTH),
      }),
    [write],
  );
  const setNote = useCallback(
    (note: string) => {
      if (value) write({ ...value, note: note.slice(0, NOTE_MAX_LENGTH) });
    },
    [value, write],
  );
  const clear = useCallback(() => write(null), [write]);
  return { spot: value, ready: mounted, park, setNote, clear };
}
