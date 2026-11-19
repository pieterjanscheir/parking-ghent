import { distanceKm, type LatLng } from "./geo";

// The city's on-street pay machines. For a car parked on the street: where
// the nearest one is, and whether it takes coins — nearly all of Ghent's are
// card-only, which is worth knowing before walking to one.
//
// Asked by the visitor's browser straight from the city's open data portal,
// like the parking bans — see lib/shared-bikes.ts for why.
const DATASET =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/locaties-parkeerautomaten-gent/records";

export const MACHINE_RADIUS_M = 250;

export type PayMachine = {
  // "Muinklaan 14"
  address: string;
  // False when the machine takes no coins or notes.
  cash: boolean;
  // Rounded to 10 m.
  metres: number;
};

export function machinesUrl(point: LatLng): string {
  const where = `within_distance(geo_point_2d, geom'POINT(${point.lng.toFixed(5)} ${point.lat.toFixed(5)})', ${MACHINE_RADIUS_M}m)`;
  const params = new URLSearchParams({
    limit: "50",
    select: "straat,huisnr,betaalmodus,status,geo_point_2d",
    where,
  });
  return `${DATASET}?${params}`;
}

// The nearest machine that is in service, or null when there is none nearby.
export function nearestMachine(json: unknown, point: LatLng): PayMachine | null {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  let best: (PayMachine & { km: number }) | null = null;
  for (const record of results as Record<string, unknown>[]) {
    if (typeof record !== "object" || record === null) continue;
    // "Actief"; the others are planned for removal.
    if (record.status !== "Actief") continue;
    const street = typeof record.straat === "string" ? record.straat.trim() : "";
    if (!street) continue;
    const at = record.geo_point_2d as { lat?: unknown; lon?: unknown } | null;
    const lat = Number(at?.lat);
    const lng = Number(at?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const km = distanceKm(point, { lat, lng });
    if (best && km >= best.km) continue;
    const number = typeof record.huisnr === "string" ? record.huisnr.trim() : "";
    best = {
      address: number ? `${street} ${number}` : street,
      cash: typeof record.betaalmodus === "string" && record.betaalmodus.toLowerCase() === "cash",
      metres: Math.round((km * 1000) / 10) * 10,
      km,
    };
  }
  if (!best) return null;
  return { address: best.address, cash: best.cash, metres: best.metres };
}
