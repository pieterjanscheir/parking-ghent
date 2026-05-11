import { describe, expect, it } from "vitest";
import {
  filterParkings,
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
    lastUpdate: "",
    photoUrl: null,
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
