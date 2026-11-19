import { describe, expect, it } from "vitest";
import {
  FORGET_AFTER_MS,
  NOTE_MAX_LENGTH,
  isCurrent,
  parseParkedSpot,
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
};

describe("parseParkedSpot", () => {
  it("reads back what was stored", () => {
    expect(parseParkedSpot(JSON.stringify(spot))).toEqual(spot);
  });

  it("accepts a spot without a note", () => {
    const stored = JSON.stringify({ ...spot, note: undefined });
    expect(parseParkedSpot(stored)).toEqual({ ...spot, note: "" });
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
