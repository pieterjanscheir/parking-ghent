"use client";

import { useCallback } from "react";
import { readStored, useLocalStorageJson } from "./local-storage-store";

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
  // When the ticket, the parking disc or the visitor's own plan runs out
  // (epoch ms), if they said so.
  until: number | null;
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
      // Only a time after parking makes sense.
      until: typeof v.until === "number" && Number.isFinite(v.until) && v.until > v.at ? v.until : null,
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

// "18:30" typed by the visitor → the next moment this device's clock shows
// that time: today, or tomorrow when it has already passed today.
export function untilFromClock(clock: string, now: number): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

// The other way round, for the time field: epoch ms → "18:30" on this device.
export function clockOf(ms: number): string {
  const at = new Date(ms);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

// How long until (or since) a moment, in whole minutes.
export function timeLeft(
  until: number,
  now: number,
): { passed: boolean; hours: number; minutes: number; totalMinutes: number } {
  const passed = until <= now;
  // Round down what is left ("in 9 min" must not be 8 and a half to go).
  const totalMinutes = passed
    ? Math.floor((now - until) / 60_000)
    : Math.floor((until - now) / 60_000);
  return { passed, hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, totalMinutes };
}

// "51.04590,3.73070" from a shared link (/parked?spot=…) → coordinates.
// Unlike the destination links this isn't limited to Ghent: a spot can be
// shared from anywhere.
export function parseSharedSpot(text: string | null | undefined): { lat: number; lng: number } | null {
  if (!text) return null;
  const match = /^(-?\d{1,2}(?:\.\d{1,7})?),(-?\d{1,3}(?:\.\d{1,7})?)$/.exec(text.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// A walking route back to the car, from wherever the visitor is.
export function walkingRouteUrl(spot: Pick<ParkedSpot, "lat" | "lng">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat}%2C${spot.lng}&travelmode=walking`;
}

// The same act of parking: same place, saved at the same moment.
export function sameSpot(a: ParkedSpot | null, b: ParkedSpot | null): boolean {
  return a !== null && b !== null && a.id === b.id && a.at === b.at;
}

// The spot as stored right now, for code that must not act on what a
// component saw a few seconds ago.
export function readParkedSpot(): ParkedSpot | null {
  const stored = readStored(STORAGE_KEY);
  return stored === null ? null : parseParkedSpot(stored);
}

// Looking up the phone's position takes a few seconds. May its result still
// be saved? Only when the spot is as it was when the lookup started: not
// cleared, not replaced by another car park, not saved again in another tab.
export function unchangedSince(startedWith: ParkedSpot | null, latest: ParkedSpot | null): boolean {
  if (startedWith === null) return latest === null;
  return sameSpot(startedWith, latest);
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
  // null removes the time.
  setUntil: (until: number | null) => void;
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
        // A new spot is a new ticket.
        until: null,
      }),
    [write],
  );
  const change = useCallback(
    (patch: Partial<Pick<ParkedSpot, "note" | "until">>) => {
      if (!value) return;
      // Another tab may have saved a different spot a moment ago, before this
      // one heard of it. The edit belongs to the spot on screen: if that is
      // no longer the stored one, drop it rather than bring the old spot back.
      const latest = readParkedSpot();
      if (!latest || !sameSpot(latest, value)) return;
      // On top of what is stored, so a note typed in one tab and a time set
      // in another both survive.
      write({ ...latest, ...patch });
    },
    [value, write],
  );
  const setNote = useCallback(
    (note: string) => change({ note: note.slice(0, NOTE_MAX_LENGTH) }),
    [change],
  );
  const setUntil = useCallback((until: number | null) => change({ until }), [change]);
  const clear = useCallback(() => write(null), [write]);
  return { spot: value, ready: mounted, park, setNote, setUntil, clear };
}
