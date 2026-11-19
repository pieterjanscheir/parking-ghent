import { describe, expect, it } from "vitest";
import { wallClockToEpoch } from "./zoned-time";

describe("wallClockToEpoch", () => {
  it("reads a winter clock time in Paris as one hour ahead of UTC", () => {
    expect(wallClockToEpoch("2026-11-19T18:30:30", "Europe/Paris")).toBe(Date.UTC(2026, 10, 19, 17, 30, 30));
  });

  it("reads a summer clock time as two hours ahead", () => {
    expect(wallClockToEpoch("2026-07-01T09:00:00", "Europe/Paris")).toBe(Date.UTC(2026, 6, 1, 7, 0, 0));
  });

  it("ignores a time zone the feed put on it", () => {
    expect(wallClockToEpoch("2026-11-19T18:30:30+00:00", "Europe/Paris")).toBe(Date.UTC(2026, 10, 19, 17, 30, 30));
  });

  it("gets the hours right on both sides of the change to winter time", () => {
    // 25 October 2026: at 03:00 summer time the clocks go back to 02:00.
    expect(wallClockToEpoch("2026-10-25T01:30:00", "Europe/Paris")).toBe(Date.UTC(2026, 9, 24, 23, 30));
    expect(wallClockToEpoch("2026-10-25T03:30:00", "Europe/Paris")).toBe(Date.UTC(2026, 9, 25, 2, 30));
  });

  it("accepts a space instead of T and no seconds", () => {
    expect(wallClockToEpoch("2026-11-19 18:30", "Europe/Paris")).toBe(Date.UTC(2026, 10, 19, 17, 30));
  });

  it("returns null for anything else", () => {
    expect(wallClockToEpoch("", "Europe/Paris")).toBeNull();
    expect(wallClockToEpoch("19/11/2026 18:30", "Europe/Paris")).toBeNull();
  });
});
