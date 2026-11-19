import { describe, expect, it } from "vitest";
import {
  GARAGE_STALE_AFTER_MS,
  dataAgeMs,
  formatAge,
  isStale,
  newestUpdate,
} from "./freshness";

const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const at = (minutesAgo: number) => ({ lastUpdatedAt: NOW - minutesAgo * 60_000 });

describe("dataAgeMs", () => {
  it("is the time since the feed's own timestamp", () => {
    expect(dataAgeMs(at(3), NOW)).toBe(3 * 60_000);
  });

  it("is null when the feed gave no timestamp", () => {
    expect(dataAgeMs({ lastUpdatedAt: null }, NOW)).toBeNull();
  });

  it("never goes negative when the feed's clock is ahead of ours", () => {
    expect(dataAgeMs(at(-2), NOW)).toBe(0);
  });
});

describe("isStale", () => {
  it("accepts the feed's normal lag, including the slower B-Park garages", () => {
    expect(isStale(at(1), NOW)).toBe(false);
    expect(isStale(at(5), NOW)).toBe(false);
    expect(isStale(at(10), NOW)).toBe(false);
  });

  it("flags a count only once it is older than the threshold", () => {
    expect(isStale({ lastUpdatedAt: NOW - GARAGE_STALE_AFTER_MS }, NOW)).toBe(false);
    expect(isStale({ lastUpdatedAt: NOW - GARAGE_STALE_AFTER_MS - 1 }, NOW)).toBe(true);
  });

  it("does not flag a garage whose timestamp is unknown", () => {
    expect(isStale({ lastUpdatedAt: null }, NOW)).toBe(false);
  });
});

describe("newestUpdate", () => {
  it("returns the most recent update across garages", () => {
    expect(newestUpdate([at(40), at(2), at(15)])).toBe(NOW - 2 * 60_000);
  });

  it("ignores garages without a timestamp", () => {
    expect(newestUpdate([{ lastUpdatedAt: null }, at(5)])).toBe(NOW - 5 * 60_000);
  });

  it("is null when nothing has a timestamp", () => {
    expect(newestUpdate([])).toBeNull();
    expect(newestUpdate([{ lastUpdatedAt: null }])).toBeNull();
  });
});

describe("formatAge", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [60_000, "1 min ago"],
    [42 * 60_000, "42 min ago"],
    [60 * 60_000, "1 h ago"],
    [5 * 60 * 60_000 + 59 * 60_000, "5 h ago"],
    [24 * 60 * 60_000, "1 day ago"],
    [3 * 24 * 60 * 60_000, "3 days ago"],
  ])("%d ms → %s", (ms, expected) => {
    expect(formatAge(ms)).toBe(expected);
  });
});
