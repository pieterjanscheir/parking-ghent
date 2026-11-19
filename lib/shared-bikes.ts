import type { LatLng } from "./geo";

// Shared bikes near a spot, for "park here and cycle on". The three operators
// publish their live positions through the city's open data portal.
//
// These requests are made by the visitor's browser straight to the portal
// (it allows that), not through our server: the answer is different for
// every car park and changes by the minute, so there is nothing to cache, and
// it costs us nothing. The portal sees the visitor's IP address, as it would
// if they opened the city's own map.
const BASE = "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets";

export const BIKE_RADIUS_M = 400;

export type BikeProvider = "donkey" | "dott" | "bolt";

export const BIKE_PROVIDER_NAMES: Record<BikeProvider, string> = {
  donkey: "Donkey Republic",
  dott: "Dott",
  bolt: "Bolt",
};

// Donkey Republic has stations with a count; Dott and Bolt list each bike.
// `usable` narrows the question to bikes that can be taken. The portal sends
// 100 records at most, and without it a busy spot could fill those with
// reserved bikes and hide the free ones.
type Source = { dataset: string; field: string; select: string; usable: string };
const FREE_FLOATING = "is_disabled=0 and is_reserved=0";
const SOURCES: Record<BikeProvider, Source> = {
  donkey: {
    dataset: "donkey-republic-beschikbaarheid-deelfietsen-per-station",
    field: "geopunt",
    select: "num_bikes_available,is_renting",
    usable: "is_renting=1",
  },
  dott: { dataset: "dott-deelfietsen-gent", field: "loc", select: "is_disabled,is_reserved", usable: FREE_FLOATING },
  bolt: { dataset: "bolt-deelfietsen-gent", field: "loc", select: "is_disabled,is_reserved", usable: FREE_FLOATING },
};

export const BIKE_PROVIDERS = Object.keys(SOURCES) as BikeProvider[];

export function bikesUrl(provider: BikeProvider, point: LatLng): string {
  const { dataset, field, select, usable } = SOURCES[provider];
  // Five decimals is about a metre: no need to send more precision than that.
  const where = `within_distance(${field}, geom'POINT(${point.lng.toFixed(5)} ${point.lat.toFixed(5)})', ${BIKE_RADIUS_M}m) and ${usable}`;
  const params = new URLSearchParams({ limit: "100", select, where });
  return `${BASE}/${dataset}/records?${params}`;
}

// The feeds use 0/1, but be forgiving about "1" and true.
const isSet = (value: unknown) => value === 1 || value === "1" || value === true;

// How many bikes can be taken right now. `atLeast` is true when the portal
// had more records than it returned (it sends 100 at most), so the real
// number is higher.
export function countBikes(
  provider: BikeProvider,
  json: unknown,
): { count: number; atLeast: boolean } {
  const body = json as { total_count?: unknown; results?: unknown } | null;
  const results = Array.isArray(body?.results) ? (body.results as Record<string, unknown>[]) : [];
  let count = 0;
  for (const record of results) {
    if (typeof record !== "object" || record === null) continue;
    if (provider === "donkey") {
      const bikes = Number(record.num_bikes_available);
      // A station that isn't renting has bikes nobody can take.
      if (Number.isFinite(bikes) && bikes > 0 && !("is_renting" in record && !isSet(record.is_renting))) {
        count += bikes;
      }
    } else if (!isSet(record.is_disabled) && !isSet(record.is_reserved)) {
      count += 1;
    }
  }
  const total = Number(body?.total_count);
  return { count, atLeast: Number.isFinite(total) && total > results.length };
}

// Where "the centre" is for onward directions: Korenmarkt, the square the
// tram lines meet at.
export const CITY_CENTRE: LatLng = { lat: 51.0546, lng: 3.7219 };

export function onwardRouteUrl(from: LatLng, mode: "transit" | "bicycling"): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.lat.toFixed(5)},${from.lng.toFixed(5)}`,
    destination: `${CITY_CENTRE.lat},${CITY_CENTRE.lng}`,
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
