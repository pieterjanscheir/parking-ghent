import type { DirectoryEntry } from "./directory";
import type { Trend } from "./forecast";
import { isStale } from "./freshness";
import { distanceKm, type LatLng } from "./geo";
import type { Parking } from "./parkings.schema";

// "Which garage should I take?" — the nearest one, unless there is a reason
// not to rely on it. The reasons are spelled out so the advice can be
// checked against the list below it.
export type PassReason = "closed" | "noData" | "full" | "almostFull" | "fillingUp";

export type Suggestion = {
  best: Parking;
  bestKm: number;
  // The nearest garage, when it isn't the one we suggest. `minutesUntilFull`
  // is set for the reason "fillingUp".
  passedOver: {
    parking: Parking;
    km: number;
    reason: PassReason;
    minutesUntilFull: number | null;
  } | null;
};

// Fewer free spaces than this is too close to "full" to send someone there:
// the count lags a few minutes and others are heading for the same spaces.
export const COMFORTABLE_SPACES = 10;
// A forecast of "full" within this many minutes counts against a garage:
// about the time it takes to drive in and reach it.
export const FULL_SOON_MINUTES = 30;

function reasonToPass(p: Parking, trend: Trend | undefined, now: number): PassReason | null {
  if (!p.isOpen) return "closed";
  if (!p.hasLiveData || isStale(p, now)) return "noData";
  if (p.bucket === "full" || p.freeSpaces === 0) return "full";
  if (p.freeSpaces < COMFORTABLE_SPACES) return "almostFull";
  const untilFull = trend?.forecast.minutesUntilFull ?? null;
  if (untilFull !== null && untilFull <= FULL_SOON_MINUTES) return "fillingUp";
  return null;
}

export function suggestGarage(
  parkings: Parking[],
  origin: LatLng,
  trendsById: Record<string, Trend>,
  now: number,
): Suggestion | null {
  const byDistance = parkings
    .filter((p) => p.lat !== null && p.lng !== null)
    .map((p) => ({ parking: p, km: distanceKm(origin, { lat: p.lat!, lng: p.lng! }) }))
    .sort((a, b) => a.km - b.km);

  let passedOver: Suggestion["passedOver"] = null;
  for (const { parking, km } of byDistance) {
    const reason = reasonToPass(parking, trendsById[parking.id], now);
    if (reason === null) return { best: parking, bestKm: km, passedOver };
    // Only the nearest one is worth explaining.
    passedOver ??= {
      parking,
      km,
      reason,
      minutesUntilFull:
        reason === "fillingUp"
          ? (trendsById[parking.id]?.forecast.minutesUntilFull ?? null)
          : null,
    };
  }
  return null;
}

// The Park & Ride closest to a point, among the live garages and the car
// parks without a count. A live one only counts while it can be relied on:
// pointing someone to a full Park & Ride helps nobody.
export function nearestParkAndRide(
  parkings: Parking[],
  extras: DirectoryEntry[],
  origin: LatLng,
  now: number,
): { id: string; name: string; km: number } | null {
  let nearest: { id: string; name: string; km: number } | null = null;
  const consider = (id: string, name: string, lat: number | null, lng: number | null) => {
    if (lat === null || lng === null) return;
    const km = distanceKm(origin, { lat, lng });
    if (!nearest || km < nearest.km) nearest = { id, name, km };
  };
  for (const p of parkings) {
    if (p.parkAndRide && reasonToPass(p, undefined, now) === null) {
      consider(p.id, p.name, p.lat, p.lng);
    }
  }
  for (const e of extras) if (e.parkAndRide) consider(e.id, e.name, e.lat, e.lng);
  return nearest;
}

// Other garages with space near this one, nearest first — for "no space
// here? try next door".
export function nearbyAlternatives(
  parking: Pick<Parking, "id" | "lat" | "lng">,
  others: Parking[],
  now: number,
  { limit = 3, withinKm = 2.5 }: { limit?: number; withinKm?: number } = {},
): { parking: Parking; km: number }[] {
  if (parking.lat === null || parking.lng === null) return [];
  const here = { lat: parking.lat, lng: parking.lng };
  return others
    .filter((p) => p.id !== parking.id && p.lat !== null && p.lng !== null)
    .filter((p) => reasonToPass(p, undefined, now) === null)
    .map((p) => ({ parking: p, km: distanceKm(here, { lat: p.lat!, lng: p.lng! }) }))
    .filter((x) => x.km <= withinKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
