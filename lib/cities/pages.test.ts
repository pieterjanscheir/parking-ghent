import { describe, expect, it } from "vitest";
import type { Parking } from "../parkings.schema";
import { OTHER_CITY_IDS, byFreeSpaces, cityPath, citySummary, isCityId, withCurrentCounts } from "./pages";

const NOW = Date.UTC(2026, 10, 20, 9, 0, 0);
const MINUTE = 60_000;

const carPark = (over: Partial<Parking>): Parking =>
  ({
    id: "a",
    name: "A",
    isOpen: true,
    hasLiveData: true,
    freeSpaces: 100,
    totalSpaces: 200,
    lastUpdatedAt: NOW - 2 * MINUTE,
    ...over,
  }) as Parking;

describe("city pages", () => {
  it("puts Ghent at the home page and every other city on its own page", () => {
    expect(cityPath("ghent")).toBe("/");
    expect(cityPath("hasselt")).toBe("/cities/hasselt");
    expect(OTHER_CITY_IDS).toEqual(["hasselt", "antwerp", "brussels", "liege", "namur", "strasbourg"]);
  });

  it("knows a city id from anything else in the address", () => {
    expect(isCityId("liege")).toBe(true);
    expect(isCityId("Liege")).toBe(false);
    expect(isCityId("parkings")).toBe(false);
    expect(isCityId("")).toBe(false);
  });

  it("counts only current counts of open car parks as space", () => {
    const summary = citySummary(
      [
        carPark({ id: "a", freeSpaces: 100 }),
        carPark({ id: "full", freeSpaces: 0 }),
        carPark({ id: "closed", isOpen: false, freeSpaces: 50 }),
        carPark({ id: "old", freeSpaces: 70, lastUpdatedAt: NOW - 45 * MINUTE }),
        carPark({ id: "none", hasLiveData: false, freeSpaces: 0 }),
      ],
      NOW,
    );
    expect(summary).toEqual({ carParks: 5, open: 4, withSpace: 1, freeSpaces: 100 });
  });

  it("is all zeroes for a city that only lists its car parks", () => {
    expect(citySummary([], NOW)).toEqual({ carParks: 0, open: 0, withSpace: 0, freeSpaces: 0 });
  });

  it("hands the map an old count as no count, and leaves current ones alone", () => {
    const fresh = carPark({ id: "fresh", freeSpaces: 100, bucket: "available" });
    const old = carPark({ id: "old", freeSpaces: 70, bucket: "available", lastUpdatedAt: NOW - 45 * MINUTE });
    const none = carPark({ id: "none", hasLiveData: false, bucket: "closed" });
    const [a, b, c] = withCurrentCounts([fresh, old, none], NOW);
    expect(a).toBe(fresh);
    expect(b).toMatchObject({ id: "old", hasLiveData: false, bucket: "closed" });
    expect(c).toBe(none);
    // The list itself is not changed: its card shows the old count with a warning.
    expect(old.hasLiveData).toBe(true);
  });

  it("sorts by room, with car parks without a usable count last", () => {
    const sorted = byFreeSpaces(
      [
        carPark({ id: "b", name: "B", freeSpaces: 20 }),
        carPark({ id: "z", name: "Z", hasLiveData: false, freeSpaces: 0 }),
        carPark({ id: "c", name: "C", freeSpaces: 300 }),
        carPark({ id: "y", name: "Y", isOpen: false, freeSpaces: 500 }),
        carPark({ id: "a", name: "A", freeSpaces: 20 }),
      ],
      NOW,
    );
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b", "y", "z"]);
  });
});
