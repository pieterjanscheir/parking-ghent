import { isStale } from "../freshness";
import type { Parking } from "../parkings.schema";
import { CITY_IDS, type CityId } from "./info";

// Where each city lives on the website. Ghent is the site's home: the
// overview at "/", with its own garage pages. Every other city has one page.

export const OTHER_CITY_IDS = CITY_IDS.filter((id) => id !== "ghent");

export function isCityId(value: string): value is CityId {
  return (CITY_IDS as readonly string[]).includes(value);
}

// The part of the address after the language ("" + this = "/nl/cities/hasselt").
export function cityPath(id: CityId): string {
  return id === "ghent" ? "/" : `/cities/${id}`;
}

// The numbers above a city's list. A count only counts while it is current:
// a car park whose number is half an hour old is not known to have space.
export function citySummary(parkings: Parking[], now: number) {
  const current = parkings.filter((p) => p.hasLiveData && !isStale(p, now));
  const withSpace = current.filter((p) => p.isOpen && p.freeSpaces > 0);
  return {
    carParks: parkings.length,
    open: parkings.filter((p) => p.isOpen).length,
    withSpace: withSpace.length,
    freeSpaces: withSpace.reduce((sum, p) => sum + p.freeSpaces, 0),
  };
}

// Most room first; car parks without a usable count last, by name.
export function byFreeSpaces(parkings: Parking[], now: number): Parking[] {
  const usable = (p: Parking) => p.isOpen && p.hasLiveData && !isStale(p, now);
  return [...parkings].sort((a, b) => {
    if (usable(a) !== usable(b)) return usable(a) ? -1 : 1;
    if (usable(a) && a.freeSpaces !== b.freeSpaces) return b.freeSpaces - a.freeSpaces;
    return a.name.localeCompare(b.name);
  });
}

// What the map may show: a count only while it is current, like the totals
// above the list. An old count is handed over as "no count", so its marker
// says "?" rather than a number nobody should rely on.
export function withCurrentCounts(parkings: Parking[], now: number): Parking[] {
  return parkings.map((p) =>
    p.hasLiveData && isStale(p, now) ? { ...p, hasLiveData: false, bucket: "closed" as const } : p,
  );
}
