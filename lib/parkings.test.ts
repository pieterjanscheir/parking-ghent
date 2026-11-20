import { describe, expect, it } from "vitest";
import type { DirectoryEntry } from "./directory";
import {
  combineSources,
  filterExtras,
  filterParkings,
  isUsable,
  sortExtras,
  sortParkings,
  uniqueTypes,
  type Filters,
} from "./parkings";
import type { Parking } from "./parkings.schema";

function p(overrides: Partial<Parking> = {}): Parking {
  return {
    id: "x",
    name: "X",
    description: "",
    openingHours: "",
    websiteUrl: "",
    operator: "",
    type: "carPark",
    typeLabel: "Indoor garage",
    category: "",
    categoryLabel: "",
    isInsideLez: false,
    isOpen: true,
    isTemporaryClosed: false,
    totalSpaces: 100,
    freeSpaces: 50,
    occupiedPercent: 50,
    freePercent: 50,
    hasLiveData: true,
    bucket: "available",
    address: "",
    lat: null,
    lng: null,
    phone: null,
    lastUpdatedAt: null,
    isFree: false,
    parkAndRide: false,
    evChargers: 0,
    evMaxKw: null,
    note: null,
    ...overrides,
  };
}

const emptyFilters: Filters = { q: "", status: [], lez: [], type: [], bucket: [] };

describe("sortParkings", () => {
  const list = [
    p({ id: "b", name: "Bravo", freeSpaces: 20, freePercent: 10 }),
    p({ id: "a", name: "Alpha", freeSpaces: 50, freePercent: 50 }),
    p({ id: "c", name: "Charlie", freeSpaces: 5, freePercent: 80 }),
  ];

  it("sorts by name ascending", () => {
    expect(sortParkings(list, "name-asc").map((x) => x.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("sorts by name descending", () => {
    expect(sortParkings(list, "name-desc").map((x) => x.name)).toEqual([
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("sorts by free spaces ascending", () => {
    expect(sortParkings(list, "spaces-asc").map((x) => x.freeSpaces)).toEqual([
      5, 20, 50,
    ]);
  });

  it("sorts by free spaces descending", () => {
    expect(sortParkings(list, "spaces-desc").map((x) => x.freeSpaces)).toEqual([
      50, 20, 5,
    ]);
  });

  it("sorts by free percent ascending and descending", () => {
    expect(sortParkings(list, "percent-asc").map((x) => x.freePercent)).toEqual([
      10, 50, 80,
    ]);
    expect(sortParkings(list, "percent-desc").map((x) => x.freePercent)).toEqual([
      80, 50, 10,
    ]);
  });

  it("does not mutate the input", () => {
    const before = list.map((x) => x.id);
    sortParkings(list, "name-desc");
    expect(list.map((x) => x.id)).toEqual(before);
  });
});

describe("filterParkings", () => {
  const list = [
    p({ id: "a", name: "Alpha", type: "carPark", bucket: "available", isOpen: true, isInsideLez: true }),
    p({ id: "b", name: "Bravo", type: "offStreetParkingGround", bucket: "full", isOpen: false, isInsideLez: false }),
    p({ id: "c", name: "Center", type: "carPark", bucket: "almost-full", isOpen: true, isInsideLez: false }),
  ];

  it("returns everything when filters are empty", () => {
    expect(filterParkings(list, emptyFilters)).toHaveLength(3);
  });

  it("matches name case-insensitively and substringy", () => {
    expect(filterParkings(list, { ...emptyFilters, q: "PHA" })).toEqual([list[0]]);
    expect(filterParkings(list, { ...emptyFilters, q: "  cen  " })).toEqual([
      list[2],
    ]);
  });

  it("filters by open/closed status", () => {
    expect(
      filterParkings(list, { ...emptyFilters, status: ["open"] }).map((x) => x.id),
    ).toEqual(["a", "c"]);
    expect(
      filterParkings(list, { ...emptyFilters, status: ["closed"] }).map((x) => x.id),
    ).toEqual(["b"]);
  });

  it("filters by LEZ", () => {
    expect(
      filterParkings(list, { ...emptyFilters, lez: ["inside"] }).map((x) => x.id),
    ).toEqual(["a"]);
    expect(
      filterParkings(list, { ...emptyFilters, lez: ["outside"] }).map((x) => x.id),
    ).toEqual(["b", "c"]);
  });

  it("filters by type", () => {
    expect(
      filterParkings(list, { ...emptyFilters, type: ["carPark"] }).map(
        (x) => x.id,
      ),
    ).toEqual(["a", "c"]);
  });

  it("filters by bucket", () => {
    expect(
      filterParkings(list, { ...emptyFilters, bucket: ["full", "almost-full"] }).map(
        (x) => x.id,
      ),
    ).toEqual(["b", "c"]);
  });

  it("combines filters with AND semantics", () => {
    const result = filterParkings(list, {
      ...emptyFilters,
      status: ["open"],
      type: ["carPark"],
      bucket: ["available"],
    });
    expect(result.map((x) => x.id)).toEqual(["a"]);
  });

  it("ignores trailing/leading whitespace in the query", () => {
    expect(filterParkings(list, { ...emptyFilters, q: "   " })).toHaveLength(3);
  });
});

describe("uniqueTypes", () => {
  it("deduplicates by value and preserves the first label seen", () => {
    const list = [
      p({ id: "1", type: "carPark", typeLabel: "Indoor garage" }),
      p({ id: "2", type: "offStreetParkingGround", typeLabel: "Surface lot" }),
      p({ id: "3", type: "carPark", typeLabel: "Indoor garage" }),
    ];
    expect(uniqueTypes(list)).toEqual([
      { value: "carPark", label: "Indoor garage" },
      { value: "offStreetParkingGround", label: "Surface lot" },
    ]);
  });

  it("skips empty type values", () => {
    const list = [p({ id: "1", type: "" }), p({ id: "2", type: "carPark" })];
    expect(uniqueTypes(list)).toEqual([
      { value: "carPark", label: "Indoor garage" },
    ]);
  });
});

describe("sortParkings — availability-first", () => {
  const list = [
    p({ id: "closed", name: "Closed", isOpen: false, freeSpaces: 500, bucket: "closed" }),
    p({ id: "nodata", name: "NoData", hasLiveData: false, freeSpaces: 0, bucket: "closed" }),
    p({ id: "small", name: "Small", freeSpaces: 10 }),
    p({ id: "big", name: "Big", freeSpaces: 300 }),
  ];

  it("puts closed / no-data parkings last when sorting by space", () => {
    expect(sortParkings(list, "spaces-desc").map((x) => x.id)).toEqual([
      "big",
      "small",
      "closed",
      "nodata",
    ]);
    expect(sortParkings(list, "spaces-asc").slice(0, 2).map((x) => x.id)).toEqual([
      "small",
      "big",
    ]);
  });

  it("keeps name sorts purely alphabetical", () => {
    expect(sortParkings(list, "name-asc")[0].id).toBe("big");
  });
});

describe("sortParkings — cheapest", () => {
  const list = [
    p({ id: "unknown-big", freeSpaces: 400 }),
    p({ id: "dear", freeSpaces: 50 }),
    p({ id: "cheap-closed", isOpen: false, bucket: "closed" }),
    p({ id: "cheap", freeSpaces: 10 }),
    p({ id: "cheap-roomy", freeSpaces: 90 }),
  ];
  // Two hours on a weekday afternoon, in cents.
  const costs = { dear: 600, "cheap-closed": 200, cheap: 240, "cheap-roomy": 240, "unknown-big": null };

  it("puts the cheapest open garage first and unknown prices last", () => {
    expect(sortParkings(list, "cheapest", null, costs).map((x) => x.id)).toEqual([
      "cheap-roomy",
      "cheap",
      "dear",
      "cheap-closed",
      "unknown-big",
    ]);
  });

  it("treats a garage missing from the costs as unknown", () => {
    expect(sortParkings(list, "cheapest", null, { dear: 600 })[0].id).toBe("dear");
  });
});

describe("sortParkings — distance", () => {
  const here = { lat: 51.054, lng: 3.72 };
  const list = [
    p({ id: "far", lat: 51.1, lng: 3.8 }),
    p({ id: "near", lat: 51.055, lng: 3.721 }),
    p({ id: "near-full", lat: 51.0541, lng: 3.7201, bucket: "full", freeSpaces: 1 }),
    p({ id: "unknown", lat: null, lng: null }),
  ];

  it("orders usable parkings by distance, unusable ones last", () => {
    expect(sortParkings(list, "distance", here).map((x) => x.id)).toEqual([
      "near",
      "far",
      "unknown",
      "near-full",
    ]);
  });

  it("falls back to most free spaces without a location", () => {
    const l = [p({ id: "a", freeSpaces: 5 }), p({ id: "b", freeSpaces: 50 })];
    expect(sortParkings(l, "distance", null).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("filterParkings — quick filters", () => {
  const list = [
    p({ id: "ok", name: "Ok", address: "Kouter 1" }),
    p({ id: "full", name: "Full", bucket: "full" }),
    p({ id: "closed", name: "Shut", isOpen: false, bucket: "closed" }),
    p({ id: "nodata", name: "Blind", hasLiveData: false, bucket: "closed" }),
  ];

  it("onlyAvailable keeps parkings that are open with live space", () => {
    expect(
      filterParkings(list, { ...emptyFilters, onlyAvailable: true }).map((x) => x.id),
    ).toEqual(["ok"]);
  });

  it("search also matches the address", () => {
    expect(filterParkings(list, { ...emptyFilters, q: "kouter" }).map((x) => x.id)).toEqual([
      "ok",
    ]);
  });
});

describe("isUsable", () => {
  it("requires open, live data and not full", () => {
    expect(isUsable(p())).toBe(true);
    expect(isUsable(p({ isOpen: false }))).toBe(false);
    expect(isUsable(p({ hasLiveData: false }))).toBe(false);
    expect(isUsable(p({ bucket: "full" }))).toBe(false);
  });
});

// ---- Car parks from the city's directory, and facilities --------------------

function entry(overrides: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    id: "p-kouter",
    name: "Kouter",
    parkAndRide: false,
    capacity: 461,
    address: "Kouter 31",
    lat: 51.05012,
    lng: 3.72365,
    url: null,
    note: null,
    isFree: null,
    evChargers: 0,
    evMaxKw: null,
    ...overrides,
  };
}

const NO_FILTERS: Filters = { q: "", status: [], lez: [], type: [], bucket: [] };

describe("combineSources", () => {
  const savaan = p({ id: "parking-savaan", name: "Savaan", lat: 51.04877, lng: 3.72395 });
  const ledeberg = p({ id: "parking-ledeberg", name: "Ledeberg", lat: 51.0379, lng: 3.7391 });
  const directory = [
    entry({ id: "p-savaan", name: "Savaan", lat: 51.04895, lng: 3.72405 }),
    entry(),
    entry({ id: "p-ledeberg", name: "Ledeberg", lat: 51.038, lng: 3.7392 }),
    entry({
      id: "pr-ledeberg",
      name: "Ledeberg",
      parkAndRide: true,
      lat: 51.0381,
      lng: 3.7393,
      note: { nl: "Parking betalend.", en: "Parking paid for.", fr: null },
    }),
  ];
  const chargePoints = [
    { lat: 51.0488, lng: 3.7241, kw: 22 },
    { lat: 51.0489, lng: 3.7238, kw: 11 },
    { lat: 51.0501, lng: 3.7237, kw: 22 },
  ];

  it("adds Park & Ride, the city's note and charge points to live garages", () => {
    const { parkings } = combineSources([savaan, ledeberg], directory, chargePoints);
    expect(parkings[0]).toMatchObject({
      id: "parking-savaan",
      parkAndRide: false,
      note: null,
      evChargers: 2,
      evMaxKw: 22,
    });
    expect(parkings[1]).toMatchObject({
      id: "parking-ledeberg",
      parkAndRide: true,
      note: { nl: "Parking betalend.", en: "Parking paid for.", fr: null },
      evChargers: 0,
    });
  });

  it("returns the car parks the live feed doesn't cover, with their charge points", () => {
    const { extras } = combineSources([savaan, ledeberg], directory, chargePoints);
    // Kouter is in the rate table (lib/tariffs.ts) as paid.
    expect(extras).toEqual([entry({ evChargers: 1, evMaxKw: 22, isFree: false })]);
  });

  it("takes free or paid from the rate table where the city's data doesn't say", () => {
    const oostakker = entry({ id: "pr-oostakker", name: "Oostakker", parkAndRide: true, lat: 51.09, lng: 3.77 });
    const zuid = entry({ id: "p-zuid", name: "Zuid", lat: 51.0419, lng: 3.7266 });
    const { extras } = combineSources([], [oostakker, zuid], []);
    expect(extras.map((e) => [e.id, e.isFree])).toEqual([
      ["pr-oostakker", true],
      // Not in the table: still unknown.
      ["p-zuid", null],
    ]);
    const loop = p({ id: "pr-loopexpo", name: "P+R The Loop", isFree: false });
    expect(combineSources([loop], [], []).parkings[0].isFree).toBe(true);
  });

  it("keeps a garage's own Park & Ride mark when the directory is unavailable", () => {
    const loop = p({ id: "pr-loopexpo", name: "P+R The Loop", parkAndRide: true });
    expect(combineSources([loop], [], []).parkings[0].parkAndRide).toBe(true);
  });

  it("counts charge points near the directory's pin of a garage matched by name", () => {
    // The live feed and the directory put this garage's pin 300 m apart.
    const loop = p({ id: "pr-loop", name: "The Loop", lat: 51.024, lng: 3.695 });
    const loopC = entry({ id: "pr-the-loop-c", name: "The Loop C", lat: 51.0267, lng: 3.695 });
    const { parkings, extras } = combineSources([loop], [loopC], [
      { lat: 51.0268, lng: 3.6951, kw: 22 },
    ]);
    expect(extras).toEqual([]);
    expect(parkings[0]).toMatchObject({ id: "pr-loop", evChargers: 1, evMaxKw: 22 });
  });

  it("lists the whole directory when the live feed is empty", () => {
    expect(combineSources([], directory, []).extras).toHaveLength(4);
  });
});

describe("facility filters", () => {
  const plain = p({ id: "plain" });
  const charging = p({ id: "charging", evChargers: 4 });
  const freeRide = p({ id: "free-ride", isFree: true, parkAndRide: true });

  it("keeps garages that have every ticked facility", () => {
    const pick = (features: string[]) =>
      filterParkings([plain, charging, freeRide], { ...NO_FILTERS, features }).map((x) => x.id);
    expect(pick([])).toEqual(["plain", "charging", "free-ride"]);
    expect(pick(["ev"])).toEqual(["charging"]);
    expect(pick(["free"])).toEqual(["free-ride"]);
    expect(pick(["pr", "free"])).toEqual(["free-ride"]);
    expect(pick(["pr", "ev"])).toEqual([]);
  });

  it("doesn't count a car park as free when the price is unknown", () => {
    const unknown = entry({ id: "unknown", isFree: null });
    const paid = entry({ id: "paid", isFree: false });
    const free = entry({ id: "free", isFree: true });
    expect(
      filterExtras([unknown, paid, free], { ...NO_FILTERS, features: ["free"] }).map((e) => e.id),
    ).toEqual(["free"]);
  });
});

describe("filterExtras", () => {
  const kouter = entry();
  const watersportbaan = entry({
    id: "pr-watersportbaan",
    name: "Watersportbaan",
    address: "Zuiderlaan",
    parkAndRide: true,
  });

  it("searches by name and street", () => {
    const find = (q: string) =>
      filterExtras([kouter, watersportbaan], { ...NO_FILTERS, q }).map((e) => e.id);
    expect(find("")).toEqual(["p-kouter", "pr-watersportbaan"]);
    expect(find("KOUT")).toEqual(["p-kouter"]);
    expect(find("zuiderlaan")).toEqual(["pr-watersportbaan"]);
    expect(find("nowhere")).toEqual([]);
  });

  it("hides them all when the filter needs live data they don't have", () => {
    const all = [kouter, watersportbaan];
    expect(filterExtras(all, { ...NO_FILTERS, onlyAvailable: true })).toEqual([]);
    expect(filterExtras(all, { ...NO_FILTERS, status: ["open"] })).toEqual([]);
    expect(filterExtras(all, { ...NO_FILTERS, lez: ["outside"] })).toEqual([]);
    expect(filterExtras(all, { ...NO_FILTERS, type: ["carPark"] })).toEqual([]);
    expect(filterExtras(all, { ...NO_FILTERS, bucket: ["available"] })).toEqual([]);
  });
});

describe("sortExtras", () => {
  const kouter = entry();
  const zuid = entry({ id: "p-zuid", name: "Zuid", lat: 51.0419, lng: 3.7266 });
  const muide = entry({ id: "pr-muide", name: "Muide", parkAndRide: true, lat: 51.0731, lng: 3.7337 });

  it("puts Park & Ride first, then sorts by name, when there is nowhere to measure from", () => {
    expect(sortExtras([zuid, kouter, muide], null).map((e) => e.id)).toEqual([
      "pr-muide",
      "p-kouter",
      "p-zuid",
    ]);
  });

  it("sorts cheapest first when there are costs, unknown prices last", () => {
    const costs = { "pr-muide": 0, "p-kouter": 560, "p-zuid": null };
    expect(sortExtras([zuid, kouter, muide], null, costs).map((e) => e.id)).toEqual([
      "pr-muide",
      "p-kouter",
      "p-zuid",
    ]);
    expect(sortExtras([zuid, kouter, muide], null, { "p-kouter": 560 }).map((e) => e.id)).toEqual([
      "p-kouter",
      "pr-muide",
      "p-zuid",
    ]);
  });

  it("sorts by distance from a destination", () => {
    const nearZuid = { lat: 51.042, lng: 3.727 };
    expect(sortExtras([muide, kouter, zuid], nearZuid).map((e) => e.id)).toEqual([
      "p-zuid",
      "p-kouter",
      "pr-muide",
    ]);
  });
});
