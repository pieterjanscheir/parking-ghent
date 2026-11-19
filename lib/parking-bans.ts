import { distanceKm, type LatLng } from "./geo";

// Temporary parking bans the city has granted: a stretch of street reserved
// for a removal van, a construction vehicle or an event, where parked cars
// get towed. Published by the city as open data, with a start and an end.
//
// Used for a car parked on the street ("Where did I park?"): is a ban coming
// up around that spot? Like the shared bikes, the question goes from the
// visitor's browser straight to the city's portal — see lib/shared-bikes.ts.
const DATASET =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/gegunde-parkeerverboden-gent/records";

// A ban covers a stretch of street and is located by its middle, and a
// phone's position is easily 20 m off: look a little wider than the car.
export const BAN_RADIUS_M = 75;
// A car left on the street for a city trip stays a few days at most.
export const BAN_LOOKAHEAD_DAYS = 7;
const MAX_BANS = 5;

export type BanKind = "loading" | "construction" | "noParking";

export type ParkingBan = {
  // Local time in Ghent, as "2026-11-24T07:00".
  from: string;
  until: string;
  kind: BanKind;
  // Already in force at the moment of asking.
  active: boolean;
  // From the spot to the middle of the stretch, rounded to 10 m.
  metres: number;
};

export function bansUrl(point: LatLng): string {
  const where = `within_distance(geo_point_2d, geom'POINT(${point.lng.toFixed(5)} ${point.lat.toFixed(5)})', ${BAN_RADIUS_M}m)`;
  const params = new URLSearchParams({
    limit: "100",
    select: "sdatum,startuur,edatum,einduur,type,geo_point_2d",
    where,
  });
  return `${DATASET}?${params}`;
}

// The time on the clocks in Ghent at a given moment, as "2026-11-19T15:04".
// The city gives its dates that way (no time zone), and texts in this shape
// can be compared as plain strings.
export function ghentClock(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// "24/11/2026" + "07:00" → "2026-11-24T07:00"; null when the date is unusable.
function clockText(date: unknown, time: unknown, fallbackTime: string): string | null {
  const day = typeof date === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim()) : null;
  if (!day) return null;
  const hours = typeof time === "string" && /^\d{2}:\d{2}$/.test(time.trim()) ? time.trim() : fallbackTime;
  return `${day[3]}-${day[2]}-${day[1]}T${hours}`;
}

function kindOf(type: unknown): BanKind {
  const text = typeof type === "string" ? type.toLowerCase() : "";
  if (text.includes("laden")) return "loading";
  if (text.includes("werf")) return "construction";
  return "noParking";
}

// The bans that matter for a car parked at `point` now: still running, or
// starting within the coming week. Nearest first — the nearer the stretch,
// the likelier the car is in it.
export function parseBans(json: unknown, point: LatLng, now: number): ParkingBan[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const nowText = ghentClock(now);
  const horizon = ghentClock(now + BAN_LOOKAHEAD_DAYS * 24 * 60 * 60_000);

  const bans: ParkingBan[] = [];
  for (const record of results as Record<string, unknown>[]) {
    if (typeof record !== "object" || record === null) continue;
    const from = clockText(record.sdatum, record.startuur, "00:00");
    const until = clockText(record.edatum, record.einduur, "23:59");
    if (!from || !until || until < from) continue;
    if (until < nowText || from > horizon) continue;
    const middle = record.geo_point_2d as { lat?: unknown; lon?: unknown } | null;
    const lat = Number(middle?.lat);
    const lng = Number(middle?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const metres = Math.round((distanceKm(point, { lat, lng }) * 1000) / 10) * 10;
    bans.push({ from, until, kind: kindOf(record.type), active: from <= nowText, metres });
  }
  return bans
    .sort((a, b) => a.metres - b.metres || a.from.localeCompare(b.from))
    .slice(0, MAX_BANS);
}

// "2026-11-24T07:00" → a Date that shows those same clock numbers when
// formatted with `timeZone: "UTC"`. For display only.
export function clockDate(text: string): Date {
  return new Date(`${text}:00Z`);
}

// How to print a ban's start and end: the time alone for an end on the same
// day as the start ("Sat 21 Nov, 07:00 to 17:00"), and the year wherever it
// isn't this year (a building site can run into the next one).
export function banDateParts(
  ban: Pick<ParkingBan, "from" | "until">,
  now: number,
): { untilTimeOnly: boolean; fromYear: boolean; untilYear: boolean } {
  const thisYear = ghentClock(now).slice(0, 4);
  return {
    untilTimeOnly: ban.from.slice(0, 10) === ban.until.slice(0, 10),
    fromYear: ban.from.slice(0, 4) !== thisYear,
    untilYear: ban.until.slice(0, 4) !== thisYear,
  };
}
