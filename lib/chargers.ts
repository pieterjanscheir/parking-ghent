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

export function parseChargePoints(json: unknown): { total: number; points: ChargePoint[] } {
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
  return { total: parsed.total_count, points };
}

export function fetchGarageChargePoints(): Promise<ChargePoint[]> {
  return cached("chargers", { ttlMs: CHARGERS_TTL_MS, staleIfError: true }, async () => {
    const all: ChargePoint[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchUpstream(`${ENDPOINT}&offset=${page * 100}`);
      if (!res.ok) throw new Error(`Charge points failed: ${res.status} ${res.statusText}`);
      const { total, points } = parseChargePoints(JSON.parse(res.text));
      all.push(...points);
      if (points.length < 100 || all.length >= total) break;
    }
    return all;
  });
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
