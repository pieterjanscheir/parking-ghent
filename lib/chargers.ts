import { z } from "zod";
import { distanceKm, type LatLng } from "./geo";
import { cached } from "./ttl-cache";
import { fetchUpstream } from "./upstream";

// Charge points for electric cars that stand inside a car park, from the
// city's list of all public charge points. (The ~1,000 on-street ones are
// left out: this app is about car parks.)
const ENDPOINT =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/laadpalen-gent/records" +
  `?where=${encodeURIComponent('ligging="Parkeergebouw" and status="In dienst"')}` +
  "&select=kw,geo_point_2d&limit=100";

const CHARGERS_TTL_MS = 24 * 60 * 60_000;
const RETRY_AFTER_MS = 60_000;
// The API returns at most 100 per request; there are about 90 today.
const MAX_PAGES = 5;

const PointSchema = z.object({
  kw: z.number().nullish(),
  geo_point_2d: z.object({ lat: z.number(), lon: z.number() }),
});

const ResponseSchema = z.object({
  total_count: z.number(),
  results: z.array(z.unknown()),
});

export type ChargePoint = LatLng & { kw: number | null };

// `received` is how many records the response held, readable or not.
export function parseChargePoints(json: unknown): {
  total: number;
  received: number;
  points: ChargePoint[];
} {
  const parsed = ResponseSchema.parse(json);
  const points: ChargePoint[] = [];
  for (const raw of parsed.results) {
    const point = PointSchema.safeParse(raw);
    if (!point.success) continue;
    points.push({
      lat: point.data.geo_point_2d.lat,
      lng: point.data.geo_point_2d.lon,
      kw: point.data.kw && point.data.kw > 0 ? point.data.kw : null,
    });
  }
  return { total: parsed.total_count, received: parsed.results.length, points };
}

export function fetchGarageChargePoints(): Promise<ChargePoint[]> {
  return cached(
    "chargers",
    // A failing list isn't worth another wait on every page view.
    { ttlMs: CHARGERS_TTL_MS, errorTtlMs: RETRY_AFTER_MS, staleIfError: true },
    loadChargePoints,
  );
}

async function loadChargePoints(): Promise<ChargePoint[]> {
  const all: ChargePoint[] = [];
  // Counted separately from `all`: a record we can't read still took up a
  // place on its page, and must not make the list look complete too early.
  let received = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchUpstream(`${ENDPOINT}&offset=${page * 100}`);
    if (!res.ok) throw new Error(`Charge points failed: ${res.status} ${res.statusText}`);
    const parsed = parseChargePoints(JSON.parse(res.text));
    all.push(...parsed.points);
    received += parsed.received;
    if (parsed.received < 100 || received >= parsed.total) break;
  }
  return all;
}

export type Charging = { count: number; maxKw: number | null };

// A charge point belongs to a car park when it stands within this distance of
// the car park's pin. Measured on the city's data: points lie 3–55 m from
// their own garage, and the closest two garages are 150 m apart.
const INSIDE_KM = 0.12;

// Each charge point is counted once, for the nearest car park.
export function chargingByPlace(
  points: ChargePoint[],
  places: { id: string; lat: number | null; lng: number | null }[],
): Record<string, Charging> {
  const out: Record<string, Charging> = {};
  for (const point of points) {
    let best: string | null = null;
    let nearest = INSIDE_KM;
    for (const place of places) {
      if (place.lat === null || place.lng === null) continue;
      const km = distanceKm(point, { lat: place.lat, lng: place.lng });
      if (km <= nearest) {
        nearest = km;
        best = place.id;
      }
    }
    if (!best) continue;
    const entry = (out[best] ??= { count: 0, maxKw: null });
    entry.count += 1;
    if (point.kw !== null && (entry.maxKw === null || point.kw > entry.maxKw)) {
      entry.maxKw = point.kw;
    }
  }
  return out;
}

// --- Every public charge point, for the map layer --------------------------

const ALL_ENDPOINT =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/laadpalen-gent/exports/json" +
  "?select=straatnaam,cpo,kw,status,geo_point_2d";

const AllPointSchema = z.object({
  straatnaam: z.string().nullish(),
  cpo: z.string().nullish(),
  kw: z.number().nullish(),
  status: z.string().nullish(),
  geo_point_2d: z.object({ lat: z.number(), lon: z.number() }),
});

// Charge points that stand together (a post usually has two sockets) are
// shown as one dot.
export type ChargeStation = LatLng & {
  count: number;
  maxKw: number | null;
  street: string;
  operator: string;
};

// From this power up a charger is a fast (DC) one: minutes, not hours.
export const FAST_CHARGER_KW = 50;

export function parseChargeStations(json: unknown): ChargeStation[] {
  const stations = new Map<string, ChargeStation>();
  for (const raw of z.array(z.unknown()).parse(json)) {
    const parsed = AllPointSchema.safeParse(raw);
    if (!parsed.success) continue;
    const p = parsed.data;
    if (p.status && p.status !== "In dienst") continue;
    const lat = p.geo_point_2d.lat;
    const lng = p.geo_point_2d.lon;
    // Four decimals is about 10 m: the sockets of one post, or posts side
    // by side.
    const id = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const kw = p.kw && p.kw > 0 ? p.kw : null;
    const station = stations.get(id);
    if (station) {
      station.count += 1;
      if (kw !== null && (station.maxKw === null || kw > station.maxKw)) station.maxKw = kw;
    } else {
      stations.set(id, {
        lat: Math.round(lat * 1e5) / 1e5,
        lng: Math.round(lng * 1e5) / 1e5,
        count: 1,
        maxKw: kw,
        street: (p.straatnaam ?? "").trim(),
        operator: (p.cpo ?? "").trim(),
      });
    }
  }
  return [...stations.values()];
}

export function fetchChargeStations(): Promise<ChargeStation[]> {
  return cached(
    "charge-stations",
    { ttlMs: CHARGERS_TTL_MS, errorTtlMs: RETRY_AFTER_MS, staleIfError: true },
    async () => {
      const res = await fetchUpstream(ALL_ENDPOINT);
      if (!res.ok) throw new Error(`Charge points failed: ${res.status} ${res.statusText}`);
      return parseChargeStations(JSON.parse(res.text));
    },
  );
}
