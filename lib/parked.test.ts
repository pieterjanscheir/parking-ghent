import { describe, expect, it } from "vitest";
import {
  FORGET_AFTER_MS,
  NOTE_MAX_LENGTH,
  isCurrent,
  clockOf,
  isStreetSpot,
  parseParkedSpot,
  parseSharedSpot,
  sameSpot,
  timeLeft,
  untilFromClock,
  walkingRouteUrl,
  type ParkedSpot,
} from "./parked";

const NOW = Date.UTC(2026, 10, 19, 14, 0, 0);
const spot: ParkedSpot = {
  id: "parking-savaan",
  name: "Savaan",
  lat: 51.04877,
  lng: 3.72395,
  at: NOW - 2 * 60 * 60_000,
  note: "level -2",
  until: null,
};

describe("parseParkedSpot", () => {
  it("reads back what was stored", () => {
    expect(parseParkedSpot(JSON.stringify(spot))).toEqual(spot);
  });

  it("accepts a spot without a note", () => {
    const stored = JSON.stringify({ ...spot, note: undefined });
    expect(parseParkedSpot(stored)).toEqual({ ...spot, note: "" });
  });

  it("keeps the time the ticket runs out, when it is after parking", () => {
    const until = spot.at + 90 * 60_000;
    expect(parseParkedSpot(JSON.stringify({ ...spot, until }))?.until).toBe(until);
    expect(parseParkedSpot(JSON.stringify({ ...spot, until: spot.at - 1 }))?.until).toBeNull();
    expect(parseParkedSpot(JSON.stringify({ ...spot, until: "18:30" }))?.until).toBeNull();
  });

  it("cuts an over-long note", () => {
    const long = { ...spot, note: "x".repeat(500) };
    expect(parseParkedSpot(JSON.stringify(long))?.note).toHaveLength(NOTE_MAX_LENGTH);
  });

  it.each([
    ["not JSON", "{oops"],
    ["a string", '"parking-savaan"'],
    ["null", "null"],
    ["no id", JSON.stringify({ ...spot, id: "" })],
    ["no name", JSON.stringify({ ...spot, name: undefined })],
    ["a text position", JSON.stringify({ ...spot, lat: "51.04" })],
    ["no time", JSON.stringify({ ...spot, at: null })],
  ])("rejects %s", (_label, raw) => {
    expect(parseParkedSpot(raw)).toBeNull();
  });
});

describe("untilFromClock", () => {
  // 15:00 on this machine's clock, whatever its time zone.
  const now = new Date(2026, 10, 19, 15, 0, 0).getTime();

  it("means later today when that time is still to come", () => {
    const until = untilFromClock("18:30", now);
    expect(until).toBe(new Date(2026, 10, 19, 18, 30).getTime());
    expect(clockOf(until!)).toBe("18:30");
  });

  it("means tomorrow when that time has passed today", () => {
    expect(untilFromClock("09:00", now)).toBe(new Date(2026, 10, 20, 9, 0).getTime());
    expect(untilFromClock("15:00", now)).toBe(new Date(2026, 10, 20, 15, 0).getTime());
  });

  it("rejects what isn't a time", () => {
    expect(untilFromClock("", now)).toBeNull();
    expect(untilFromClock("25:00", now)).toBeNull();
    expect(untilFromClock("12:75", now)).toBeNull();
    expect(untilFromClock("half six", now)).toBeNull();
  });
});

describe("timeLeft", () => {
  it("counts down in whole minutes, rounded down", () => {
    expect(timeLeft(NOW + 100 * 60_000 + 59_000, NOW)).toEqual({
      passed: false,
      hours: 1,
      minutes: 40,
      totalMinutes: 100,
    });
    expect(timeLeft(NOW + 30_000, NOW)).toMatchObject({ passed: false, totalMinutes: 0 });
  });

  it("counts up once the time has passed", () => {
    expect(timeLeft(NOW - 12 * 60_000, NOW)).toEqual({
      passed: true,
      hours: 0,
      minutes: 12,
      totalMinutes: 12,
    });
    expect(timeLeft(NOW, NOW).passed).toBe(true);
  });
});

describe("parseSharedSpot", () => {
  it("reads coordinates from a shared link", () => {
    expect(parseSharedSpot("51.04590,3.73070")).toEqual({ lat: 51.0459, lng: 3.7307 });
    expect(parseSharedSpot(" 48.8584,2.2945 ")).toEqual({ lat: 48.8584, lng: 2.2945 });
    expect(parseSharedSpot("-33.86,151.21")).toEqual({ lat: -33.86, lng: 151.21 });
  });

  it("rejects anything else", () => {
    for (const text of ["", null, undefined, "51.04", "91,3.7", "51,181", "51.0459;3.7307", "a,b", "51.0459,3.7307,9", "<script>"]) {
      expect(parseSharedSpot(text)).toBeNull();
    }
  });
});

describe("sameSpot", () => {
  it("is the same act of parking only with the same place and moment", () => {
    expect(sameSpot(spot, { ...spot, note: "row C" })).toBe(true);
    expect(sameSpot(spot, { ...spot, at: spot.at + 1 })).toBe(false);
    expect(sameSpot(spot, { ...spot, id: "parking-reep" })).toBe(false);
    expect(sameSpot(spot, null)).toBe(false);
    expect(sameSpot(null, null)).toBe(false);
  });
});

describe("isStreetSpot", () => {
  it("tells a spot on the street from a car park", () => {
    expect(isStreetSpot({ id: "street" })).toBe(true);
    expect(isStreetSpot(spot)).toBe(false);
  });
});

describe("isCurrent", () => {
  it("keeps a spot from earlier today", () => {
    expect(isCurrent(spot, NOW)).toBe(true);
  });

  it("drops a spot that is a week old", () => {
    expect(isCurrent({ ...spot, at: NOW - FORGET_AFTER_MS }, NOW)).toBe(false);
    expect(isCurrent({ ...spot, at: NOW - FORGET_AFTER_MS + 60_000 }, NOW)).toBe(true);
  });

  it("drops a spot dated in the future, but tolerates a clock a few seconds off", () => {
    expect(isCurrent({ ...spot, at: NOW + 60 * 60_000 }, NOW)).toBe(false);
    expect(isCurrent({ ...spot, at: NOW + 5_000 }, NOW)).toBe(true);
  });
});

describe("walkingRouteUrl", () => {
  it("asks for a walking route to the car park", () => {
    const url = new URL(walkingRouteUrl(spot));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("destination")).toBe("51.04877,3.72395");
    expect(url.searchParams.get("travelmode")).toBe("walking");
  });
});
