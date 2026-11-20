import { CITY_INFO, inBounds, type CityInfo } from "./cities/info";
import { cityPath } from "./cities/pages";
import { normalizeSearch } from "./destinations";
import type { DirectoryEntry } from "./directory";
import type { Trend } from "./forecast";
import { isStale } from "./freshness";
import { distanceKm, formatLatLng, walkingMinutes, type LatLng } from "./geo";
import { WEEKDAYS, ghentHour, typicalAt, type Profile, type Weekday } from "./history-profile";
import type { Parking } from "./parkings.schema";
import { minutesLeftUntilFull, nearestParkAndRide, suggestGarage } from "./recommend";
import {
  rateColumns,
  stayCost,
  tariffFor,
  weekdayRuns,
  type RateColumn,
  type TariffEntry,
  type TariffNote,
} from "./tariffs";
import { wallClockToEpoch } from "./zoned-time";

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
  // The forecast counts from the reading it was made from, which is a few
  // minutes old by now. Each value is given with its moment, and moments that
  // have already passed are left out.
  const { forecast } = trend;
  const madeAt = forecast.atTimestamp - forecast.horizonMinutes * 60_000;
  const base = Number.isFinite(madeAt) ? madeAt : src.now;
  const expected = forecast.horizons
    .map((h) => ({ at: base + h.minutes * 60_000, free_spaces: h.freeSpaces }))
    .filter((h) => h.at > src.now)
    .map((h) => ({ at: new Date(h.at).toISOString(), free_spaces: h.free_spaces }));
  const untilFull = minutesLeftUntilFull(trend, src.now);
  if (expected.length === 0 && untilFull === null) return null;
  return { expected_free_spaces: expected, likely_full_in_minutes: untilFull };
}

// --- Prices ------------------------------------------------------------------

const euros = (cents: number | null) => (cents === null ? null : cents / 100);

// Stays the price summary gives a cost for, in hours.
const EXAMPLE_STAYS = [1, 2, 4, 8, 24] as const;

const NOTE_TEXT: Record<TariffNote, string> = {
  events:
    "Rates can differ during big events (Gentse Feesten, Lichtfestival, Winterfeesten, Braderie Publique); those are not included.",
  holidays: "On Belgian public holidays the daytime rate is the Sunday rate (included).",
  pcard: "Pcard customers get 25% off; not included.",
  registration:
    "Free only when the number plate is registered within 72 hours at a P+R pillar in the centre (Zuid, Kouter or Korenmarkt); otherwise the normal rates apply on leaving.",
};

// The rate table entry for a car park, where this city has one. null means
// the price is unknown: never read it as "free".
function tariffOf(src: Sources, id: string): TariffEntry | null {
  return src.city.knows.rates ? tariffFor(id) : null;
}

// What a stay costs here (euro cents), or null when unknown.
function costAt(src: Sources, id: string, arrival: number, minutes: number): number | null {
  const entry = tariffOf(src, id);
  return entry ? stayCost(entry.tariff, arrival, minutes) : null;
}

// What staying 1, 2, 4, 8 or 24 hours from now costs, and where the rates
// come from. For every car park in a list.
function priceSummary(src: Sources, id: string) {
  const entry = tariffOf(src, id);
  if (!entry) return null;
  const cost_from_now_eur: Record<string, number | null> = {};
  for (const hours of EXAMPLE_STAYS) {
    cost_from_now_eur[`${hours}h`] = euros(stayCost(entry.tariff, src.now, hours * 60));
  }
  return {
    free: entry.tariff.kind === "free",
    // null: a price for that length isn't known.
    cost_from_now_eur,
    operator: entry.operator,
    source_url: entry.sourceUrl,
    checked_on: entry.checkedOn,
  };
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function whenApplies(column: RateColumn, dayStart: number, dayEnd: number): string {
  if (column.period === "always") return "around the clock";
  if (column.period === "night") return `every night ${hh(dayEnd)}–${hh(dayStart)}`;
  const days = weekdayRuns(column.weekdays)
    .map(([a, b]) => (a === b ? WEEKDAY_NAMES[a] : `${WEEKDAY_NAMES[a]}–${WEEKDAY_NAMES[b]}`))
    .join(", ");
  return `${days}${column.holidays ? " and public holidays" : ""} ${hh(dayStart)}–${hh(dayEnd)}`;
}

// The operator's full rates, for one car park.
function ratesOf(src: Sources, id: string) {
  const entry = tariffOf(src, id);
  if (!entry) return null;
  const { tariff } = entry;
  const notes = entry.notes.map((note) => NOTE_TEXT[note]);
  if (tariff.kind === "free") {
    return {
      free: true,
      free_up_to_hours: tariff.maxMinutes === undefined ? null : tariff.maxMinutes / 60,
      notes,
      operator: entry.operator,
      source_url: entry.sourceUrl,
      checked_on: entry.checkedOn,
    };
  }
  const [dayStart, dayEnd] =
    tariff.schedule.kind === "day-night" ? [tariff.schedule.dayStartHour, tariff.schedule.dayEndHour] : [0, 0];
  return {
    free: false,
    // Each band's table: the price after 1, 2, 3 … slices of the given
    // length, then the band's maximum. Times are Ghent time.
    bands: rateColumns(tariff).map((column) => {
      const ladder = tariff.bands[column.band];
      return {
        applies: whenApplies(column, dayStart, dayEnd),
        slice_minutes: ladder.sliceMinutes,
        ...(ladder.prices
          ? { price_eur_after_slices: ladder.prices.map((cents) => cents / 100) }
          : { price_eur_per_slice: (ladder.perSlice ?? 0) / 100 }),
        max_eur: ladder.cap / 100,
      };
    }),
    max_per_24_hours_eur: tariff.dailyCap / 100,
    free_minutes_when_leaving_at_once: tariff.graceMinutes,
    how_a_stay_is_charged:
      "Each run of hours inside one band is charged on that band's table; every 24 hours from arrival cost at most max_per_24_hours_eur, and a longer stay starts counting again. cheapest_parking does this sum.",
    notes,
    operator: entry.operator,
    source_url: entry.sourceUrl,
    checked_on: entry.checkedOn,
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
    // What a stay starting now costs, from the operator's published rates;
    // null where they aren't known.
    price: priceSummary(src, p.id),
    ev_charge_points: knows.charging ? p.evChargers : null,
    inside_low_emission_zone: knows.lowEmissionZone ? p.isInsideLez : null,
    position: p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null,
    url: pageUrl(src, p.id) ?? (p.websiteUrl || null),
  };
}

function carParkWithoutCount(e: DirectoryEntry, src: Sources) {
  const { knows } = src.city;
  return {
    id: e.id,
    name: e.name,
    address: e.address || null,
    // The city publishes no live count for this one.
    free_spaces: null,
    total_spaces: e.capacity,
    park_and_ride: knows.parkAndRide ? e.parkAndRide : null,
    // null where it isn't known.
    free_of_charge: e.isFree,
    price: priceSummary(src, e.id),
    // Where a city's data isn't complete on this, a number means "at least
    // these" and nothing means unknown, not none.
    ev_charge_points: knows.charging ? e.evChargers : e.evChargers > 0 ? e.evChargers : null,
    url: pageUrl(src, e.id) ?? e.url,
  };
}

// What a city that only lists its car parks can and cannot answer.
const noCountsNote = (src: Sources) =>
  src.city.knows.liveCounts
    ? null
    : `${src.city.name} publishes where its car parks are and how big, not how full they are right now. Nothing here says whether there is space.`;

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
    note: noCountsNote(src),
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
      city_remark: live.note?.en ?? live.note?.nl ?? null,
      rates: ratesOf(src, live.id),
    };
  }
  const extra = findExtra(src, input.garage);
  if (extra) {
    return {
      ...carParkWithoutCount(extra, src),
      position: { lat: extra.lat, lng: extra.lng },
      city_remark: extra.note?.en ?? extra.note?.nl ?? null,
      rates: ratesOf(src, extra.id),
    };
  }
  throw new ToolInputError(
    `No car park called "${input.garage}" in ${src.city.name}. Known car parks: ${allNames(src)}.`,
  );
}

// How many car parks without a count find_parking lists by distance.
const NEAREST_WITHOUT_COUNT = 3;

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
  // Nearest first, by distance only: nothing is known about room in these.
  const uncounted = src.extras
    .map((e) => {
      const km = distanceKm(place, e);
      return {
        ...carParkWithoutCount(e, src),
        position: { lat: e.lat, lng: e.lng },
        distance_m: Math.round(km * 1000), walking_minutes: walkingMinutes(km) };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, NEAREST_WITHOUT_COUNT);

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
    nearest_car_parks_without_live_count: uncounted,
    see_on_the_website: src.city.hasPages ? `${src.siteUrl}/en?${link}` : null,
    note: noCountsNote(src),
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

// A moment from the assistant: with an offset or "Z" as given, without one
// as Ghent's clock time.
function parseArrival(text: string | undefined, now: number): number {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return now;
  const ms = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
    ? Date.parse(trimmed)
    : wallClockToEpoch(trimmed, "Europe/Brussels");
  if (ms === null || !Number.isFinite(ms)) {
    throw new ToolInputError(
      'arrive_at must be a date and time such as "2026-11-21T14:00" (Ghent time), or one with an offset such as "2026-11-21T13:00Z".',
    );
  }
  return ms;
}

// The longest stay cheapest_parking prices: a week.
const MAX_STAY_MINUTES = 7 * 24 * 60;
// How many priced car parks it lists.
const CHEAPEST_LIMIT = 10;

export function cheapestParking(
  src: Sources,
  input: {
    stay_minutes: number;
    arrive_at?: string;
    inside_low_emission_zone?: boolean;
    only_with_space?: boolean;
  },
) {
  const minutes = input.stay_minutes;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_STAY_MINUTES) {
    throw new ToolInputError(`stay_minutes must be a whole number from 1 to ${MAX_STAY_MINUTES}.`);
  }
  const arrival = parseArrival(input.arrive_at, src.now);
  const lez = input.inside_low_emission_zone;
  if (lez !== undefined && !src.city.knows.lowEmissionZone) {
    throw new ToolInputError(`${src.city.name}'s data doesn't say which car parks lie inside a low-emission zone.`);
  }
  const { knows } = src.city;
  const live = src.parkings.filter(
    (p) => (lez === undefined || p.isInsideLez === lez) && (!input.only_with_space || hasSpace(p, src)),
  );
  // Without a live count, or without a known zone, a car park can't be said
  // to match those filters.
  const extras = lez === undefined && !input.only_with_space ? src.extras : [];
  const rows = [
    ...live.map((p) => ({
      cost: costAt(src, p.id, arrival, minutes),
      usable: p.isOpen && p.hasLiveData,
      free: p.hasLiveData ? p.freeSpaces : -1,
      row: {
        id: p.id,
        name: p.name,
        address: p.address || null,
        open: p.isOpen,
        free_spaces: p.hasLiveData ? p.freeSpaces : null,
        count_is_current: p.hasLiveData && !isStale(p, src.now),
        inside_low_emission_zone: knows.lowEmissionZone ? p.isInsideLez : null,
        park_and_ride: knows.parkAndRide ? p.parkAndRide : null,
        url: pageUrl(src, p.id) ?? (p.websiteUrl || null),
      },
    })),
    ...extras.map((e) => ({
      cost: costAt(src, e.id, arrival, minutes),
      // Whether it is open or has room isn't known.
      usable: true,
      free: -1,
      row: {
        id: e.id,
        name: e.name,
        address: e.address || null,
        open: null,
        free_spaces: null,
        count_is_current: false,
        inside_low_emission_zone: null,
        park_and_ride: knows.parkAndRide ? e.parkAndRide : null,
        url: pageUrl(src, e.id) ?? e.url,
      },
    })),
  ];
  const known = rows
    .filter((item) => item.cost !== null)
    .sort((a, b) => a.cost! - b.cost! || Number(b.usable) - Number(a.usable) || b.free - a.free);
  const unknown = rows.filter((item) => item.cost === null);
  return {
    city: src.city.name,
    arrive_at: new Date(arrival).toISOString(),
    stay_minutes: minutes,
    inside_low_emission_zone: lez ?? null,
    // Cheapest first. cost_eur is an estimate from the operators' published
    // rates; the car park's own pay machine decides.
    cheapest: known.slice(0, CHEAPEST_LIMIT).map((item) => ({
      ...item.row,
      cost_eur: euros(item.cost),
      rates_source: tariffOf(src, item.row.id)?.sourceUrl ?? null,
    })),
    // No confirmed rates for these: their price is unknown, not zero.
    price_unknown: unknown.map((item) => item.row.name),
    note: !knows.rates
      ? `This site knows no parking rates for ${src.city.name}, so it cannot say which car park is cheapest.`
      : [
          "Estimates from the rates each operator publishes (get_garage gives the full rates and their source). Event rates (Gentse Feesten, Lichtfestival …) and discount cards are not included.",
          lez !== undefined || input.only_with_space
            ? "Car parks without a live count are left out: whether they have room, or lie inside the zone, isn't known."
            : null,
        ]
          .filter(Boolean)
          .join(" "),
    source: sourceLine(src),
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
      // false: the city only lists where its car parks are and how big.
      live_free_spaces: city.knows.liveCounts,
      park_and_ride_marked: city.knows.parkAndRide,
      // What a stay costs (cheapest_parking); elsewhere unknown, not free.
      parking_rates: city.knows.rates,
      forecast_for_the_next_hour: city.knows.forecast,
      usual_pattern_per_hour_of_the_week: city.knows.typical,
      well_known_places_by_name: city.placeNames().length > 0,
      // Whether each car park has its own page here (Ghent only).
      pages_on_this_site: city.hasPages,
      // The city's page on this site.
      overview_page: `${siteUrl}/en${cityPath(city.id) === "/" ? "" : cityPath(city.id)}`,
      source: city.source,
    })),
    default_city: "ghent",
    site: siteUrl,
  };
}
