import { describe, expect, it } from "vitest";
import { ANTWERP, GHENT, HASSELT, STRASBOURG } from "./cities/info";
import type { DirectoryEntry } from "./directory";
import type { Trend } from "./forecast";
import type { Snapshot } from "./history-archive";
import { buildProfile } from "./history-profile";
import {
  ToolInputError,
  findParking,
  getGarage,
  listCities,
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
  city: GHENT,
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
    // Where it is, so a card can offer a route to it.
    expect(result.best_choice!.position).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
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
    expect(result).toMatchObject({ weekday: "sat", hour: "14:00 (local time)", measuring_since: "2026-11-07" });
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

describe("another city", () => {
  // Three car parks around Strasbourg's cathedral, as the plug-in delivers them.
  const base = { isInsideLez: false, evChargers: 0, evMaxKw: null, note: null, openingHours: "", operator: "", address: "" };
  const gutenberg = garage({ ...base, id: "parking-gutenberg", name: "Parking Gutenberg", lat: 48.5805, lng: 7.7478, websiteUrl: "https://www.strasbourg.eu/lieu/gutenberg" });
  const austerlitz = garage({ ...base, id: "parking-austerlitz", name: "Parking Austerlitz", lat: 48.5775, lng: 7.7527, freeSpaces: 300 });
  const rotonde = garage({ ...base, id: "parking-rotonde", name: "Parking Rotonde", lat: 48.5915, lng: 7.7262 });
  const strasbourg = (over: Partial<Sources> = {}) =>
    sources({ city: STRASBOURG, parkings: [gutenberg, austerlitz, rotonde], extras: [], ...over });
  const CATHEDRAL = { lat: 48.5818, lng: 7.7509 };

  it("answers with unknown, not no, for what its data doesn't say", () => {
    const [first] = listGarages(strasbourg(), {}).garages_with_live_count;
    expect(first).toMatchObject({
      city: "Strasbourg",
      park_and_ride: null,
      free_of_charge: null,
      ev_charge_points: null,
      inside_low_emission_zone: null,
      forecast: null,
      usually_free_at_this_hour: null,
    });
    expect(listGarages(strasbourg(), {}).source).toBe(
      "Eurométropole de Strasbourg open data (Licence Ouverte), via https://example.org",
    );
  });

  it("links to the city's own page when this site has none", () => {
    expect(getGarage(strasbourg(), { garage: "gutenberg" }).url).toBe("https://www.strasbourg.eu/lieu/gutenberg");
    expect(getGarage(strasbourg(), { garage: "austerlitz" }).url).toBeNull();
  });

  it("finds the best garage for coordinates in that city", () => {
    const result = findParking(strasbourg(), { ...CATHEDRAL, destination: "Cathédrale" });
    expect(result).toMatchObject({ city: "Strasbourg", see_on_the_website: null });
    expect(result.best_choice?.id).toBe("parking-gutenberg");
    // The data doesn't say which car parks are Park & Ride: none is named.
    expect(result.nearest_park_and_ride).toBeNull();
  });

  it("asks for coordinates, and only ones in that city", () => {
    expect(() => findParking(strasbourg(), { destination: "Cathédrale" })).toThrow(/knows no places by name/);
    // A point in Ghent is not a destination in Strasbourg.
    expect(() => findParking(strasbourg(), { lat: 51.05, lng: 3.72 })).toThrow(/in or around Strasbourg \(about 48\.58, 7\.75\)/);
  });

  it("says it keeps no history there", () => {
    expect(typicalAvailability(strasbourg(), { weekday: "sat", hour: 14 })).toMatchObject({
      city: "Strasbourg",
      garages: [],
      note: expect.stringMatching(/keeps no history for Strasbourg/),
    });
  });
});

describe("listCities", () => {
  it("lists the cities and what is known about each", () => {
    const { cities, default_city } = listCities("https://example.org");
    expect(default_city).toBe("ghent");
    expect(cities.map((c) => [c.id, c.forecast_for_the_next_hour, c.well_known_places_by_name, c.pages_on_this_site])).toEqual([
      ["ghent", true, true, true],
      ["hasselt", false, false, false],
      ["antwerp", false, false, false],
      ["brussels", false, false, false],
      ["liege", false, false, false],
      ["namur", false, false, false],
      ["strasbourg", false, false, false],
    ]);
  });

  it("says which cities have live counts and which only list their car parks", () => {
    const { cities } = listCities("https://example.org");
    expect(cities.filter((c) => c.live_free_spaces).map((c) => c.id)).toEqual(["ghent", "hasselt", "strasbourg"]);
    expect(cities.filter((c) => !c.live_free_spaces).map((c) => c.id)).toEqual([
      "antwerp",
      "brussels",
      "liege",
      "namur",
    ]);
    expect(cities.find((c) => c.id === "ghent")?.overview_page).toBe("https://example.org/en");
    expect(cities.find((c) => c.id === "hasselt")?.overview_page).toBe("https://example.org/en/cities/hasselt");
    expect(cities.find((c) => c.id === "strasbourg")?.park_and_ride_marked).toBe(false);
    expect(cities.find((c) => c.id === "antwerp")?.park_and_ride_marked).toBe(true);
  });
});

describe("a city that only lists its car parks", () => {
  const entry = (over: Partial<DirectoryEntry>): DirectoryEntry => ({
    id: "parking-arenberg",
    name: "Parking Arenberg",
    lat: 51.2151,
    lng: 4.409,
    parkAndRide: false,
    capacity: 387,
    address: "Oudevaartplaats 2 - 4",
    url: "https://www.interparking.be/nl/parkeren/antwerpen/arenberg/",
    note: null,
    isFree: null,
    evChargers: 13,
    evMaxKw: null,
    ...over,
  });
  const arenberg = entry({});
  const groenplaats = entry({ id: "parking-groenplaats", name: "Parking Groenplaats", lat: 51.2189, lng: 4.4011, capacity: 400, evChargers: 0, url: null });
  const schoonselhof = entry({ id: "p-r-schoonselhof", name: "P&R Schoonselhof", lat: 51.1695, lng: 4.3652, parkAndRide: true, capacity: 116, isFree: true, evChargers: 0, url: null });
  const far1 = entry({ id: "far-1", name: "Parking Noord", lat: 51.26, lng: 4.42, url: null });
  const antwerp = () =>
    sources({ city: ANTWERP, parkings: [], extras: [arenberg, groenplaats, schoonselhof, far1], trends: {}, profile: null });
  // The cathedral.
  const CATHEDRAL = { lat: 51.2203, lng: 4.4015 };

  it("lists every car park without a count and says that nothing is known about room", () => {
    const result = listGarages(antwerp(), {});
    expect(result.garages_with_live_count).toEqual([]);
    expect(result.car_parks_without_live_count).toHaveLength(4);
    expect(result.car_parks_without_live_count[0]).toEqual({
      id: "parking-arenberg",
      name: "Parking Arenberg",
      address: "Oudevaartplaats 2 - 4",
      free_spaces: null,
      total_spaces: 387,
      park_and_ride: false,
      // Unknown, not "paid".
      free_of_charge: null,
      ev_charge_points: 13,
      // No page on this site: the operator's own.
      url: "https://www.interparking.be/nl/parkeren/antwerpen/arenberg/",
    });
    expect(result.note).toMatch(/Antwerp publishes where its car parks are and how big, not how full/);
    expect(result.source).toBe("City of Antwerp open geodata, via https://example.org");
  });

  it("gives no charge points rather than zero where none are listed", () => {
    const [, groen, ride] = listGarages(antwerp(), {}).car_parks_without_live_count;
    expect(groen.ev_charge_points).toBeNull();
    expect(ride).toMatchObject({ park_and_ride: true, free_of_charge: true, ev_charge_points: null, url: null });
  });

  it("recommends nothing, and lists the nearest car parks by distance instead", () => {
    const result = findParking(antwerp(), { ...CATHEDRAL, destination: "Kathedraal" });
    expect(result.best_choice).toBeNull();
    expect(result.other_garages_with_space).toEqual([]);
    expect(result.nearest_car_parks_without_live_count.map((c) => c.name)).toEqual([
      "Parking Groenplaats",
      "Parking Arenberg",
      "Parking Noord",
    ]);
    const [nearest] = result.nearest_car_parks_without_live_count;
    expect(nearest.distance_m).toBeGreaterThan(100);
    expect(nearest.distance_m).toBeLessThan(250);
    expect(nearest.walking_minutes).toBeGreaterThan(0);
    expect(result.nearest_park_and_ride).toMatchObject({ name: "P&R Schoonselhof", url: null });
    expect(result.note).toMatch(/not how full/);
    expect(result.see_on_the_website).toBeNull();
  });

  it("finds one car park by name, with its position", () => {
    expect(getGarage(antwerp(), { garage: "groenplaats" })).toMatchObject({
      name: "Parking Groenplaats",
      free_spaces: null,
      total_spaces: 400,
      position: { lat: 51.2189, lng: 4.4011 },
    });
    expect(() => getGarage(antwerp(), { garage: "Meir" })).toThrow(/No car park called "Meir" in Antwerp/);
  });

  it("leaves Ghent's answers as they were, plus the nearest car parks without a count", () => {
    const result = findParking(sources(), { destination: "Gravensteen" });
    expect(result.note).toBeNull();
    expect(result.nearest_car_parks_without_live_count.map((c) => c.id)).toEqual([ride.id]);
    expect(listGarages(sources(), {}).note).toBeNull();
  });
});

describe("Hasselt", () => {
  it("marks its Park & Ride sites, and leaves price and charging unknown", () => {
    const carpool = garage({ id: "p-r-carpool", name: "Parking P+R carpool Hasselt-Zuid (gratis)", parkAndRide: true, lat: 50.9, lng: 5.33, evChargers: 0 });
    const [first] = listGarages(sources({ city: HASSELT, parkings: [carpool], extras: [], trends: {}, profile: null }), {})
      .garages_with_live_count;
    expect(first).toMatchObject({
      city: "Hasselt",
      free_spaces: 120,
      park_and_ride: true,
      free_of_charge: null,
      ev_charge_points: null,
      inside_low_emission_zone: null,
      forecast: null,
    });
  });
});
