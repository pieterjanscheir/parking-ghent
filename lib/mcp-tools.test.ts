import { describe, expect, it } from "vitest";
import type { DirectoryEntry } from "./directory";
import type { Trend } from "./forecast";
import type { Snapshot } from "./history-archive";
import { buildProfile } from "./history-profile";
import {
  ToolInputError,
  findParking,
  getGarage,
  listGarages,
  typicalAvailability,
  type Sources,
} from "./mcp-tools";
import type { Parking } from "./parkings.schema";

// Thursday 19 November 2026, 14:00 in Ghent.
const NOW = Date.UTC(2026, 10, 19, 13, 0, 0);
const MINUTE = 60_000;

function garage(overrides: Partial<Parking> = {}): Parking {
  return {
    id: "near",
    name: "Vrijdagmarkt",
    description: "",
    openingHours: "24/7",
    websiteUrl: "",
    operator: "Stad Gent",
    type: "carPark",
    typeLabel: "",
    category: "",
    categoryLabel: "",
    isInsideLez: true,
    isOpen: true,
    isTemporaryClosed: false,
    totalSpaces: 400,
    freeSpaces: 120,
    occupiedPercent: 70,
    freePercent: 30,
    hasLiveData: true,
    bucket: "available",
    address: "Vrijdagmarkt 1",
    lat: 51.0565,
    lng: 3.7212,
    phone: null,
    lastUpdatedAt: NOW - 2 * MINUTE,
    isFree: false,
    parkAndRide: false,
    evChargers: 4,
    evMaxKw: 22,
    note: { nl: "Enkel via de Vlaanderenstraat.", en: "Only via Vlaanderenstraat.", fr: null },
    ...overrides,
  };
}

const near = garage();
const middle = garage({ id: "middle", name: "Sint-Michiels", lat: 51.0535, lng: 3.7225, freeSpaces: 300 });
const far = garage({ id: "far", name: "Savaan", lat: 51.0489, lng: 3.7239, freeSpaces: 80 });
const ride: DirectoryEntry = {
  id: "pr-watersportbaan",
  name: "Watersportbaan",
  parkAndRide: true,
  capacity: 250,
  address: "Noorderlaan",
  lat: 51.0503,
  lng: 3.6842,
  url: null,
  note: { nl: "P+R gratis.", en: "P+R free.", fr: null },
  isFree: true,
  evChargers: 0,
  evMaxKw: null,
};

const trend = (minutesUntilFull: number | null): Trend =>
  ({
    forecast: {
      minutesUntilFull,
      horizons: [
        { minutes: 15, freeSpaces: 110, freeLo: 100, freeHi: 120 },
        { minutes: 30, freeSpaces: 95, freeLo: 80, freeHi: 110 },
        { minutes: 60, freeSpaces: 70, freeLo: 40, freeHi: 100 },
      ],
    },
  }) as Trend;

const sources = (over: Partial<Sources> = {}): Sources => ({
  parkings: [near, middle, far],
  extras: [ride],
  trends: {},
  profile: null,
  now: NOW,
  siteUrl: "https://example.org",
  ...over,
});

describe("listGarages", () => {
  it("lists live garages with the most room first, and the car parks without a count", () => {
    const result = listGarages(sources(), {});
    expect(result.garages_with_live_count.map((g) => [g.name, g.free_spaces])).toEqual([
      ["Sint-Michiels", 300],
      ["Vrijdagmarkt", 120],
      ["Savaan", 80],
    ]);
    expect(result.garages_with_live_count[1]).toMatchObject({
      id: "near",
      open: true,
      total_spaces: 400,
      count_is_current: true,
      count_updated_at: "2026-11-19T12:58:00.000Z",
      ev_charge_points: 4,
      inside_low_emission_zone: true,
      forecast: null,
      url: "https://example.org/en/parkings/near",
    });
    expect(result.car_parks_without_live_count).toEqual([
      expect.objectContaining({ id: "pr-watersportbaan", free_spaces: null, total_spaces: 250, park_and_ride: true }),
    ]);
  });

  it("never passes off a missing or old count as live", () => {
    const stale = garage({ id: "stale", name: "Stale", lastUpdatedAt: NOW - 45 * MINUTE });
    const broken = garage({ id: "broken", name: "Broken", hasLiveData: false, freeSpaces: 0 });
    const result = listGarages(sources({ parkings: [stale, broken], trends: { stale: trend(null) } }), {});
    const byId = Object.fromEntries(result.garages_with_live_count.map((g) => [g.id, g]));
    expect(byId.stale).toMatchObject({ free_spaces: 120, count_is_current: false, forecast: null });
    expect(byId.broken).toMatchObject({ free_spaces: null, count_is_current: false });
  });

  it("can leave out everything without known space", () => {
    const full = garage({ id: "full", name: "Full", freeSpaces: 0, bucket: "full" });
    const closed = garage({ id: "closed", name: "Closed", isOpen: false });
    const result = listGarages(sources({ parkings: [near, full, closed] }), { only_with_space: true });
    expect(result.garages_with_live_count.map((g) => g.id)).toEqual(["near"]);
    expect(result.car_parks_without_live_count).toEqual([]);
  });

  it("adds the forecast where there is one", () => {
    const [first] = listGarages(sources({ parkings: [near], trends: { near: trend(40) } }), {}).garages_with_live_count;
    // No time on this forecast: taken as made now.
    expect(first.forecast).toEqual({
      expected_free_spaces: [
        { at: "2026-11-19T13:15:00.000Z", free_spaces: 110 },
        { at: "2026-11-19T13:30:00.000Z", free_spaces: 95 },
        { at: "2026-11-19T14:00:00.000Z", free_spaces: 70 },
      ],
      likely_full_in_minutes: 40,
    });
  });

  it("leaves out forecast moments that have already passed", () => {
    // Made from a reading 20 minutes old: its "+15 min" is behind us.
    const aged = trend(null);
    Object.assign(aged.forecast, { horizonMinutes: 30, atTimestamp: NOW - 20 * MINUTE + 30 * MINUTE });
    const [first] = listGarages(sources({ parkings: [near], trends: { near: aged } }), {}).garages_with_live_count;
    expect(first.forecast?.expected_free_spaces).toEqual([
      { at: "2026-11-19T13:10:00.000Z", free_spaces: 95 },
      { at: "2026-11-19T13:40:00.000Z", free_spaces: 70 },
    ]);
  });
});

describe("getGarage", () => {
  it("finds a garage by id or by part of its name, whatever the accents and case", () => {
    expect(getGarage(sources(), { garage: "middle" })).toMatchObject({ name: "Sint-Michiels" });
    expect(getGarage(sources(), { garage: "vrijdag" })).toMatchObject({
      id: "near",
      opening_hours: "24/7",
      operator: "Stad Gent",
      position: { lat: 51.0565, lng: 3.7212 },
      city_remark: "Only via Vlaanderenstraat.",
    });
  });

  it("also knows the car parks without a count", () => {
    expect(getGarage(sources(), { garage: "Watersportbaan" })).toMatchObject({
      id: "pr-watersportbaan",
      free_spaces: null,
      free_of_charge: true,
      city_remark: "P+R free.",
    });
  });

  it("says which car parks exist when the name is unknown", () => {
    expect(() => getGarage(sources(), { garage: "Nowhere" })).toThrow(ToolInputError);
    expect(() => getGarage(sources(), { garage: "Nowhere" })).toThrow(/Vrijdagmarkt, Sint-Michiels, Savaan, Watersportbaan/);
  });
});

describe("findParking", () => {
  it("recommends the nearest suitable garage for a well-known place", () => {
    const result = findParking(sources(), { destination: "gravensteen" });
    expect(result.destination.name).toBe("Gravensteen");
    expect(result.best_choice).toMatchObject({ id: "near", walking_minutes: expect.any(Number) });
    expect(result.best_choice!.distance_m).toBeLessThan(200);
    expect(result.why_not_the_nearest).toBeNull();
    expect(result.other_garages_with_space.map((g) => g.id)).toEqual(["middle", "far"]);
    expect(result.nearest_park_and_ride).toMatchObject({ id: "pr-watersportbaan" });
    expect(result.see_on_the_website).toBe("https://example.org/en?dest=Gravensteen&at=51.05718%2C3.72077&sort=distance");
  });

  it("explains why the nearest garage was passed over", () => {
    const full = garage({ freeSpaces: 0, bucket: "full" });
    const result = findParking(sources({ parkings: [full, middle, far] }), { destination: "Gravensteen" });
    expect(result.best_choice?.id).toBe("middle");
    expect(result.why_not_the_nearest).toBe("Vrijdagmarkt is closer but is full.");
    expect(result.other_garages_with_space.map((g) => g.id)).toEqual(["far"]);
  });

  it("takes coordinates for anything that isn't a well-known place", () => {
    const result = findParking(sources(), { lat: 51.0489, lng: 3.724, destination: "Savaanstraat 13" });
    expect(result.destination).toEqual({ name: "Savaanstraat 13", lat: 51.0489, lng: 3.724 });
    expect(result.best_choice?.id).toBe("far");
  });

  it("refuses places it doesn't know and points outside Ghent", () => {
    expect(() => findParking(sources(), { destination: "Hoogstraat 12" })).toThrow(/Pass lat and lng instead/);
    // Nothing to search for is not "the most popular place".
    expect(() => findParking(sources(), { destination: "!!!" })).toThrow(/Pass lat and lng instead/);
    expect(() => findParking(sources(), {})).toThrow(ToolInputError);
    expect(() => findParking(sources(), { lat: 48.85, lng: 2.35 })).toThrow(/in or around Ghent/);
    expect(() => findParking(sources(), { lat: 51.05 })).toThrow(ToolInputError);
  });

  it("has no best choice when nothing suitable is left", () => {
    const closed = garage({ isOpen: false });
    const result = findParking(sources({ parkings: [closed], extras: [] }), { destination: "Gravensteen" });
    expect(result.best_choice).toBeNull();
    expect(result.nearest_park_and_ride).toBeNull();
  });
});

describe("typicalAvailability", () => {
  const WEEK = 7 * 24 * 60 * MINUTE;
  // Saturdays at 14:00 in Ghent (13:00 UTC in winter).
  const SAT_14 = Date.UTC(2026, 10, 14, 13, 0);
  const snap = (ms: number, readings: Record<string, number>): Snapshot => ({
    t: Math.floor(ms / 1000),
    g: Object.fromEntries(
      Object.entries(readings).map(([id, f]) => [id, { f, c: 400, u: Math.floor(ms / 1000) - 60, o: 1 as const }]),
    ),
  });
  const profile = buildProfile(
    [snap(SAT_14 - WEEK, { near: 20, middle: 250 }), snap(SAT_14, { near: 40, middle: 210 })],
    NOW,
  );

  it("ranks the garages by how much room they usually have at that hour", () => {
    const result = typicalAvailability(sources({ profile }), { weekday: "sat", hour: 14 });
    expect(result.garages).toEqual([
      expect.objectContaining({ id: "middle", usually_free_spaces: 230, measured_on_days: 2, total_spaces: 400 }),
      expect.objectContaining({ id: "near", usually_free_spaces: 30, measured_on_days: 2 }),
    ]);
    expect(result).toMatchObject({ weekday: "sat", hour: "14:00 (time in Ghent)", measuring_since: "2026-11-07" });
  });

  it("can answer for one garage", () => {
    const result = typicalAvailability(sources({ profile }), { weekday: "sat", hour: 14, garage: "Vrijdagmarkt" });
    expect(result.garages.map((g) => g.id)).toEqual(["near"]);
    expect(() => typicalAvailability(sources({ profile }), { weekday: "sat", hour: 14, garage: "Nowhere" })).toThrow(ToolInputError);
  });

  it("says so when there are no measurements for that hour", () => {
    expect(typicalAvailability(sources({ profile }), { weekday: "mon", hour: 3 })).toMatchObject({
      garages: [],
      note: expect.stringMatching(/No measurements/),
    });
    expect(typicalAvailability(sources(), { weekday: "sat", hour: 14 })).toMatchObject({ garages: [], measuring_since: null });
  });

  it("rejects an hour that doesn't exist", () => {
    expect(() => typicalAvailability(sources({ profile }), { weekday: "sat", hour: 24 })).toThrow(ToolInputError);
  });

  it("tells a garage what is usual right now", () => {
    // NOW is a Thursday 14:00; give that hour a measurement.
    const thursday = buildProfile([snap(NOW - WEEK, { near: 90 })], NOW);
    expect(getGarage(sources({ profile: thursday }), { garage: "near" })).toMatchObject({
      usually_free_at_this_hour: { free_spaces: 90, measured_on_days: 1 },
    });
  });
});
