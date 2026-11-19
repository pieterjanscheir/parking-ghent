import { distanceKm, type LatLng } from "./geo";

// Bus and tram stops (De Lijn) near a spot, from the city's open data. On a
// Park & Ride page: which stop to walk to. Asked by the visitor's browser
// straight from the city's portal — see lib/shared-bikes.ts for why.
const DATASET =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/bushaltes-gent/records";

export const STOP_RADIUS_M = 400;
// Four, not three: at P+R Watersportbaan the stop named after the car park
// is the fourth nearest to the city's pin for it.
const MAX_STOPS = 4;

export type TransitStop = {
  name: string;
  bus: boolean;
  tram: boolean;
  // To the nearest platform of that name, rounded to 10 m.
  metres: number;
};

export function stopsUrl(point: LatLng): string {
  const where = `within_distance(locatie, geom'POINT(${point.lng.toFixed(5)} ${point.lat.toFixed(5)})', ${STOP_RADIUS_M}m)`;
  const params = new URLSearchParams({
    limit: "50",
    select: "omschrijving,bedieningstypes,locatie",
    where,
  });
  return `${DATASET}?${params}`;
}

// The nearest stops that are in use, one line per stop name: the two sides of
// a street are separate records with the same name.
export function nearestStops(json: unknown, point: LatLng): TransitStop[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const byName = new Map<string, TransitStop & { km: number }>();
  for (const record of results as Record<string, unknown>[]) {
    if (typeof record !== "object" || record === null) continue;
    const name = typeof record.omschrijving === "string" ? record.omschrijving.trim() : "";
    // No service type means no bus or tram calls there (any more).
    const types = typeof record.bedieningstypes === "string" ? record.bedieningstypes.toUpperCase() : "";
    const bus = types.includes("BUS");
    const tram = types.includes("TRAM");
    if (!name || (!bus && !tram)) continue;
    const at = record.locatie as { lat?: unknown; lon?: unknown } | null;
    const lat = Number(at?.lat);
    const lng = Number(at?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const km = distanceKm(point, { lat, lng });
    const known = byName.get(name);
    byName.set(name, {
      name,
      bus: bus || (known?.bus ?? false),
      tram: tram || (known?.tram ?? false),
      km: known ? Math.min(known.km, km) : km,
      metres: 0,
    });
  }
  return [...byName.values()]
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_STOPS)
    .map(({ name, bus, tram, km }) => ({ name, bus, tram, metres: Math.round((km * 1000) / 10) * 10 }));
}
