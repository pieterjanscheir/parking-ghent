import { describe, expect, it } from "vitest";
import { wallClockAt, wallClockToEpoch } from "./zoned-time";

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

describe("wallClockAt", () => {
  it("gives the local date, time and weekday", () => {
    // 20 November 2026, 14:05 UTC: a Friday, 15:05 in Brussels.
    expect(wallClockAt(Date.UTC(2026, 10, 20, 14, 5), "Europe/Brussels")).toEqual({
      year: 2026,
      month: 11,
      day: 20,
      hour: 15,
      minute: 5,
      weekday: 5,
    });
  });

  it("turns the date over at local midnight, not at UTC midnight", () => {
    const clock = wallClockAt(Date.UTC(2026, 10, 20, 23, 30), "Europe/Brussels");
    expect([clock.day, clock.hour, clock.weekday]).toEqual([21, 0, 6]);
  });

  it("is the reverse of wallClockToEpoch", () => {
    const ms = wallClockToEpoch("2026-07-01T09:00:00", "Europe/Brussels")!;
    expect(wallClockAt(ms, "Europe/Brussels")).toMatchObject({ month: 7, day: 1, hour: 9, minute: 0 });
  });
});
