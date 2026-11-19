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
