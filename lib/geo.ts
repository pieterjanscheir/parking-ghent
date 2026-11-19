export type LatLng = { lat: number; lng: number };

// Great-circle distance in kilometres (haversine). Plenty precise at city
// scale, where the error vs. road distance dwarfs the spherical-earth error.
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// `locale` only affects the decimal separator ("1.3 km" vs "1,3 km").
export function formatDistance(km: number, locale = "en"): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  const digits = km < 10 ? 1 : 0;
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(km);
  return `${value} km`;
}

// Rough walking time for a straight-line distance. Streets are never
// straight, so the distance is stretched by 30% (a common rule of thumb for
// city centres) and walked at 4.8 km/h. Good for "about 5 minutes", not for
// catching a train.
const DETOUR_FACTOR = 1.3;
const WALKING_METRES_PER_MINUTE = 80;

export function walkingMinutes(km: number): number {
  return Math.max(
    1,
    Math.round((km * 1000 * DETOUR_FACTOR) / WALKING_METRES_PER_MINUTE),
  );
}

// "51.04758,3.72795" (as stored in a shared link) → coordinates. Anything
// that isn't a point in or around Ghent is rejected, so a mangled or
// hand-edited link can't sort the garages by distance to nowhere.
export function parseLatLng(text: string | null | undefined): LatLng | null {
  if (!text) return null;
  const match = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(text.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  const inGhentArea = lat >= 50.9 && lat <= 51.3 && lng >= 3.5 && lng <= 3.95;
  return inGhentArea ? { lat, lng } : null;
}

export function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}
