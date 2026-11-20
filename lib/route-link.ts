// A link that opens driving directions to a spot in Google Maps (or in the
// maps app the phone prefers for such links).
export function drivingRouteUrl(lat: number, lng: number): string {
  const destination = encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
