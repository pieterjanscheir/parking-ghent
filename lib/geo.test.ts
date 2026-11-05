import { describe, expect, it } from "vitest";
import { distanceKm, formatDistance } from "./geo";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 51, lng: 3.7 }, { lat: 51, lng: 3.7 })).toBe(0);
  });

  it("matches a known distance (Gent-Sint-Pieters → Korenmarkt ≈ 2 km)", () => {
    const d = distanceKm({ lat: 51.0357, lng: 3.7101 }, { lat: 51.0545, lng: 3.7206 });
    expect(d).toBeGreaterThan(1.9);
    expect(d).toBeLessThan(2.4);
  });
});

describe("formatDistance", () => {
  it("uses metres below 1 km and km above", () => {
    expect(formatDistance(0.234)).toBe("230 m");
    expect(formatDistance(1.26)).toBe("1.3 km");
    expect(formatDistance(14.6)).toBe("15 km");
  });
});
