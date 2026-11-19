import { describe, expect, it } from "vitest";
import type { DirectoryEntry } from "./directory";
import type { Trend } from "./forecast";
import type { Parking } from "./parkings.schema";
import { nearbyAlternatives, nearestParkAndRide, suggestGarage } from "./recommend";

const NOW = Date.UTC(2026, 10, 19, 13, 0, 0);
const MINUTE = 60_000;

// Destination: Gravensteen. The three garages lie at increasing distance.
const GRAVENSTEEN = { lat: 51.05718, lng: 3.72077 };

function garage(overrides: Partial<Parking> = {}): Parking {
  return {
    id: "near",
    name: "Near",
    description: "",
    openingHours: "",
    websiteUrl: "",
    operator: "",
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
    address: "",
    lat: 51.0565,
    lng: 3.7212,
    phone: null,
    lastUpdatedAt: NOW - 2 * MINUTE,
    isFree: false,
    parkAndRide: false,
    evChargers: 0,
    evMaxKw: null,
    note: null,
    ...overrides,
  };
}

const near = garage();
const middle = garage({ id: "middle", name: "Middle", lat: 51.0535, lng: 3.7225 });
const far = garage({ id: "far", name: "Far", lat: 51.0489, lng: 3.7239 });

function trend(minutesUntilFull: number | null): Trend {
  return { forecast: { minutesUntilFull } } as Trend;
}

describe("suggestGarage", () => {
  it("suggests the nearest garage when nothing speaks against it", () => {
    const result = suggestGarage([far, near, middle], GRAVENSTEEN, {}, NOW);
    expect(result?.best.id).toBe("near");
    expect(result?.passedOver).toBeNull();
    expect(result?.bestKm).toBeGreaterThan(0.05);
    expect(result?.bestKm).toBeLessThan(0.15);
  });

  it.each([
    ["closed", { isOpen: false }],
    ["noData", { hasLiveData: false }],
    ["noData", { lastUpdatedAt: NOW - 45 * MINUTE }],
    ["full", { bucket: "full" as const, freeSpaces: 3 }],
    ["full", { freeSpaces: 0 }],
    ["almostFull", { freeSpaces: 9, bucket: "almost-full" as const }],
  ])("passes over the nearest garage when it is %s", (reason, overrides) => {
    const result = suggestGarage([garage(overrides), middle, far], GRAVENSTEEN, {}, NOW);
    expect(result?.best.id).toBe("middle");
    expect(result?.passedOver).toMatchObject({ parking: { id: "near" }, reason });
  });

  it("passes over a garage that is forecast to be full on arrival", () => {
    const result = suggestGarage([near, middle], GRAVENSTEEN, { near: trend(20) }, NOW);
    expect(result?.best.id).toBe("middle");
    expect(result?.passedOver).toMatchObject({ reason: "fillingUp", minutesUntilFull: 20 });
  });

  it("doesn't mind a garage that fills up much later, or has no forecast", () => {
    expect(suggestGarage([near, middle], GRAVENSTEEN, { near: trend(55) }, NOW)?.best.id).toBe("near");
    expect(suggestGarage([near, middle], GRAVENSTEEN, { near: trend(null) }, NOW)?.best.id).toBe("near");
  });

  it("accepts a large garage in the 'almost full' band that still has plenty of spaces", () => {
    const busy = garage({ freeSpaces: 60, bucket: "almost-full" });
    expect(suggestGarage([busy, middle], GRAVENSTEEN, {}, NOW)?.best.id).toBe("near");
  });

  it("explains only the nearest garage it passed over", () => {
    const result = suggestGarage(
      [garage({ isOpen: false }), garage({ id: "middle", lat: 51.0535, lng: 3.7225, freeSpaces: 0 }), far],
      GRAVENSTEEN,
      {},
      NOW,
    );
    expect(result?.best.id).toBe("far");
    expect(result?.passedOver).toMatchObject({ parking: { id: "near" }, reason: "closed" });
  });

  it("has no suggestion when no garage can be relied on", () => {
    expect(suggestGarage([garage({ isOpen: false })], GRAVENSTEEN, {}, NOW)).toBeNull();
    expect(suggestGarage([], GRAVENSTEEN, {}, NOW)).toBeNull();
  });

  it("ignores garages without a position", () => {
    const nowhere = garage({ id: "nowhere", lat: null, lng: null });
    expect(suggestGarage([nowhere, far], GRAVENSTEEN, {}, NOW)?.best.id).toBe("far");
  });
});

function lot(overrides: Partial<DirectoryEntry>): DirectoryEntry {
  return {
    id: "pr-far",
    name: "Far lot",
    parkAndRide: true,
    capacity: 100,
    address: "",
    lat: 51.1,
    lng: 3.8,
    url: null,
    note: null,
    isFree: null,
    evChargers: 0,
    evMaxKw: null,
    ...overrides,
  };
}

describe("nearestParkAndRide", () => {
  it("finds the closest one among live garages and car parks without a count", () => {
    const liveRide = garage({ id: "live-ride", name: "Live ride", parkAndRide: true, lat: 51.03, lng: 3.7 });
    const closeLot = lot({ id: "pr-close", name: "Close lot", lat: 51.06, lng: 3.715 });
    const result = nearestParkAndRide([near, liveRide], [lot({}), closeLot], GRAVENSTEEN, NOW);
    expect(result).toMatchObject({ id: "pr-close", name: "Close lot" });
    expect(result?.km).toBeLessThan(1);
  });

  it("skips ordinary garages, and a live Park & Ride that is closed or full", () => {
    const closedRide = garage({ id: "closed-ride", parkAndRide: true, isOpen: false });
    const fullRide = garage({ id: "full-ride", parkAndRide: true, freeSpaces: 0, bucket: "full" });
    const plainGarage = lot({ id: "p-kouter", parkAndRide: false, lat: 51.057, lng: 3.72 });
    expect(
      nearestParkAndRide([near, closedRide, fullRide], [plainGarage], GRAVENSTEEN, NOW),
    ).toBeNull();
  });
});

describe("nearbyAlternatives", () => {
  it("lists other garages with space, nearest first", () => {
    const result = nearbyAlternatives(near, [far, near, middle], NOW);
    expect(result.map((x) => x.parking.id)).toEqual(["middle", "far"]);
    expect(result[0].km).toBeLessThan(result[1].km);
  });

  it("leaves out garages that are full, closed, stale or too far", () => {
    const full = garage({ id: "full", lat: 51.0566, lng: 3.7213, freeSpaces: 0 });
    const closed = garage({ id: "closed", lat: 51.0567, lng: 3.7214, isOpen: false });
    const stale = garage({ id: "stale", lat: 51.0568, lng: 3.7215, lastUpdatedAt: NOW - 60 * MINUTE });
    const distant = garage({ id: "distant", lat: 51.02, lng: 3.69 });
    expect(nearbyAlternatives(near, [full, closed, stale, distant, middle], NOW).map((x) => x.parking.id)).toEqual([
      "middle",
    ]);
  });

  it("returns at most the requested number", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      garage({ id: `g${i}`, lat: 51.055 - i * 0.001, lng: 3.722 }),
    );
    expect(nearbyAlternatives(near, many, NOW)).toHaveLength(3);
    expect(nearbyAlternatives(near, many, NOW, { limit: 5 })).toHaveLength(5);
  });

  it("has nothing to offer for a garage without a position", () => {
    expect(nearbyAlternatives({ id: "x", lat: null, lng: null }, [middle], NOW)).toEqual([]);
  });
});
