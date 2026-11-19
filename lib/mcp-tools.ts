import { CITY_INFO, inBounds, type CityInfo } from "./cities/info";
import { normalizeSearch } from "./destinations";
import type { DirectoryEntry } from "./directory";
import type { Trend } from "./forecast";
import { isStale } from "./freshness";
import { distanceKm, formatLatLng, walkingMinutes, type LatLng } from "./geo";
import { WEEKDAYS, ghentHour, typicalAt, type Profile, type Weekday } from "./history-profile";
import type { Parking } from "./parkings.schema";
import { minutesLeftUntilFull, nearestParkAndRide, suggestGarage } from "./recommend";

// What the MCP endpoint (app/api/mcp) answers with: the same data and the
// same rules as the website, as plain objects an AI assistant can read.
// Everything here is a pure function of `Sources`, so it is tested without a
// network or a protocol.

export type Sources = {
  // Which city the question is about.
  city: CityInfo;
  parkings: Parking[];
  // Car parks the city lists without a live count.
  extras: DirectoryEntry[];
  trends: Record<string, Trend>;
  profile: Profile | null;
  now: number;
  // "https://example.org": where links to the website point.
  siteUrl: string;
};

// A question that can't be answered as asked; the text goes back to the
// assistant, which can correct itself.
export class ToolInputError extends Error {}

// The car park's page on this site, where the city has pages here.
const pageUrl = (src: Sources, id: string) =>
  src.city.hasPages ? `${src.siteUrl}/en/parkings/${encodeURIComponent(id)}` : null;

const sourceLine = (src: Sources) => `${src.city.source}, via ${src.siteUrl}`;

function forecastOf(p: Parking, src: Sources) {
  const trend = src.trends[p.id];
  // The same rule as the website: no forecast on top of an out-of-date count.
  if (!trend || !p.hasLiveData || isStale(p, src.now)) return null;
  const at = (minutes: number) =>
    trend.forecast.horizons.find((h) => h.minutes === minutes)?.freeSpaces ?? null;
  return {
    free_in_15_min: at(15),
    free_in_30_min: at(30),
    free_in_60_min: at(60),
    likely_full_in_minutes: minutesLeftUntilFull(trend, src.now),
  };
}

function liveGarage(p: Parking, src: Sources) {
  const today = ghentHour(src.now);
  const typical = typicalAt(src.profile, p.id, today.weekday, today.hour);
  const { knows } = src.city;
  return {
    id: p.id,
    name: p.name,
    city: src.city.name,
    address: p.address || null,
    open: p.isOpen,
    // null when the city's feed has no usable count for this garage.
    free_spaces: p.hasLiveData ? p.freeSpaces : null,
    total_spaces: p.totalSpaces,
    count_updated_at: p.lastUpdatedAt === null ? null : new Date(p.lastUpdatedAt).toISOString(),
    // False when the count is missing or more than 30 minutes old.
    count_is_current: p.hasLiveData && !isStale(p, src.now),
    forecast: forecastOf(p, src),
    usually_free_at_this_hour: typical ? { free_spaces: typical.free, measured_on_days: typical.days } : null,
    // null where this city's data doesn't say: unknown, not "no".
    park_and_ride: knows.parkAndRide ? p.parkAndRide : null,
    free_of_charge: knows.price ? p.isFree : null,
    ev_charge_points: knows.charging ? p.evChargers : null,
    inside_low_emission_zone: knows.lowEmissionZone ? p.isInsideLez : null,
    url: pageUrl(src, p.id) ?? (p.websiteUrl || null),
  };
}

function carParkWithoutCount(e: DirectoryEntry, src: Sources) {
  return {
    id: e.id,
    name: e.name,
    address: e.address || null,
    // The city publishes no live count for this one.
    free_spaces: null,
    total_spaces: e.capacity,
    park_and_ride: e.parkAndRide,
    free_of_charge: e.isFree,
    ev_charge_points: e.evChargers,
    url: pageUrl(src, e.id),
  };
}

const hasSpace = (p: Parking, src: Sources) =>
  p.isOpen && p.hasLiveData && !isStale(p, src.now) && p.freeSpaces > 0;

export function listGarages(src: Sources, input: { only_with_space?: boolean }) {
  const live = input.only_with_space ? src.parkings.filter((p) => hasSpace(p, src)) : src.parkings;
  return {
    city: src.city.name,
    asked_at: new Date(src.now).toISOString(),
    garages_with_live_count: [...live]
      .sort((a, b) => b.freeSpaces - a.freeSpaces)
      .map((p) => liveGarage(p, src)),
    // Left out when only garages known to have space were asked for.
    car_parks_without_live_count: input.only_with_space
      ? []
      : src.extras.map((e) => carParkWithoutCount(e, src)),
    source: sourceLine(src),
  };
}

function findLive(src: Sources, text: string): Parking | null {
  const q = normalizeSearch(text);
  if (!q) return null;
  return (
    src.parkings.find((p) => p.id === text.trim()) ??
    src.parkings.find((p) => normalizeSearch(p.name) === q) ??
    src.parkings.find((p) => normalizeSearch(p.name).includes(q)) ??
    null
  );
}

function findExtra(src: Sources, text: string): DirectoryEntry | null {
  const q = normalizeSearch(text);
  if (!q) return null;
  return (
    src.extras.find((e) => e.id === text.trim()) ??
    src.extras.find((e) => normalizeSearch(e.name) === q) ??
    src.extras.find((e) => normalizeSearch(e.name).includes(q)) ??
    null
  );
}

const allNames = (src: Sources) => [...src.parkings, ...src.extras].map((p) => p.name).join(", ");

export function getGarage(src: Sources, input: { garage: string }) {
  const live = findLive(src, input.garage);
  if (live) {
    return {
      ...liveGarage(live, src),
      opening_hours: live.openingHours || null,
      operator: live.operator || null,
      phone: live.phone,
      position: live.lat !== null && live.lng !== null ? { lat: live.lat, lng: live.lng } : null,
      city_remark: live.note?.en ?? live.note?.nl ?? null,
    };
  }
  const extra = findExtra(src, input.garage);
  if (extra) {
    return {
      ...carParkWithoutCount(extra, src),
      position: { lat: extra.lat, lng: extra.lng },
      city_remark: extra.note?.en ?? extra.note?.nl ?? null,
    };
  }
  throw new ToolInputError(
    `No car park called "${input.garage}" in ${src.city.name}. Known car parks: ${allNames(src)}.`,
  );
}

const PASS_REASON = {
  closed: "is closed",
  noData: "has no reliable count right now",
  full: "is full",
  almostFull: "has only a few spaces left",
  fillingUp: "is likely to be full soon",
} as const;

function resolvePlace(
  city: CityInfo,
  input: { destination?: string; lat?: number; lng?: number },
): LatLng & { name: string } {
  const around = `in or around ${city.name} (about ${city.center.lat.toFixed(2)}, ${city.center.lng.toFixed(2)})`;
  if (input.lat !== undefined || input.lng !== undefined) {
    const point =
      input.lat !== undefined && input.lng !== undefined && Number.isFinite(input.lat + input.lng)
        ? { lat: input.lat, lng: input.lng }
        : null;
    if (!point || !inBounds(point, city.bounds)) {
      throw new ToolInputError(`lat and lng must both be given and lie ${around}.`);
    }
    return { name: input.destination?.trim() || formatLatLng(point), ...point };
  }
  const text = input.destination?.trim() ?? "";
  const place = city.findPlace(text);
  if (!place) {
    const names = city.placeNames();
    throw new ToolInputError(
      names.length > 0
        ? `"${text}" is not a place this tool knows by name. Pass lat and lng instead, or one of: ${names.join(", ")}.`
        : `For ${city.name} this tool knows no places by name. Pass lat and lng of the destination, ${around}.`,
    );
  }
  return { name: place.name, lat: place.lat, lng: place.lng };
}

export function findParking(src: Sources, input: { destination?: string; lat?: number; lng?: number }) {
  const place = resolvePlace(src.city, input);
  const suggestion = suggestGarage(src.parkings, place, src.trends, src.now);
  const withDistance = (p: Parking) => {
    const km = distanceKm(place, { lat: p.lat!, lng: p.lng! });
    return {
      ...liveGarage(p, src),
      distance_m: Math.round(km * 1000),
      // An estimate from the straight-line distance, not a route.
      walking_minutes: walkingMinutes(km),
    };
  };
  const others = src.parkings
    .filter((p) => p.lat !== null && p.lng !== null && p.id !== suggestion?.best.id && hasSpace(p, src))
    .map(withDistance)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 3);
  const ride = src.city.knows.parkAndRide
    ? nearestParkAndRide(src.parkings, src.extras, place, src.now)
    : null;
  const passed = suggestion?.passedOver ?? null;
  const link = new URLSearchParams({ dest: place.name, at: formatLatLng(place), sort: "distance" });

  return {
    city: src.city.name,
    destination: { name: place.name, lat: place.lat, lng: place.lng },
    // The nearest garage that is open, has a current count and comfortable
    // room, and isn't forecast to fill up within half an hour.
    best_choice: suggestion ? withDistance(suggestion.best) : null,
    why_not_the_nearest: passed ? `${passed.parking.name} is closer but ${PASS_REASON[passed.reason]}.` : null,
    other_garages_with_space: others,
    nearest_park_and_ride: ride
      ? { id: ride.id, name: ride.name, distance_m: Math.round(ride.km * 1000), url: pageUrl(src, ride.id) }
      : null,
    see_on_the_website: src.city.hasPages ? `${src.siteUrl}/en?${link}` : null,
    source: sourceLine(src),
  };
}

export function typicalAvailability(
  src: Sources,
  input: { weekday: Weekday; hour: number; garage?: string },
) {
  const weekday = WEEKDAYS.indexOf(input.weekday);
  if (weekday < 0 || !Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    throw new ToolInputError("weekday must be one of mon…sun and hour a whole number from 0 to 23.");
  }
  let garages = src.parkings;
  if (input.garage) {
    const one = findLive(src, input.garage);
    if (!one) {
      throw new ToolInputError(
        `No garage with a live count called "${input.garage}". Known: ${src.parkings.map((p) => p.name).join(", ")}.`,
      );
    }
    garages = [one];
  }
  const rows = garages
    .map((p) => ({ p, typical: typicalAt(src.profile, p.id, weekday, input.hour) }))
    .filter((row) => row.typical !== null)
    .map(({ p, typical }) => ({
      id: p.id,
      name: p.name,
      usually_free_spaces: typical!.free,
      total_spaces: p.totalSpaces,
      // On how many different days this hour was measured: with one or two,
      // treat it as an indication only.
      measured_on_days: typical!.days,
      url: pageUrl(src, p.id),
    }))
    .sort((a, b) => b.usually_free_spaces - a.usually_free_spaces);
  return {
    city: src.city.name,
    weekday: input.weekday,
    hour: `${String(input.hour).padStart(2, "0")}:00 (local time)`,
    garages: rows,
    measuring_since: src.profile?.from ?? null,
    note: !src.city.knows.typical
      ? `This site keeps no history for ${src.city.name} yet, so it cannot say what is usual there. Live counts are available through list_garages.`
      : rows.length === 0
        ? "No measurements for this hour of the week yet. The site has only been keeping its own history for a short while."
        : "Medians of this site's own measurements over at most the last four weeks. A pattern, not a promise.",
  };
}

// Which cities the tools can answer for, and how much they know about each.
export function listCities(siteUrl: string) {
  return {
    cities: Object.values(CITY_INFO).map((city) => ({
      id: city.id,
      name: city.name,
      country: city.country,
      centre: city.center,
      live_free_spaces: true,
      forecast_for_the_next_hour: city.knows.forecast,
      usual_pattern_per_hour_of_the_week: city.knows.typical,
      well_known_places_by_name: city.placeNames().length > 0,
      pages_on_this_site: city.hasPages,
      source: city.source,
    })),
    default_city: "ghent",
    site: siteUrl,
  };
}
