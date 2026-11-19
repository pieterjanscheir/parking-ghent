import { describe, expect, it } from "vitest";
import {
  distanceKm,
  formatDistance,
  formatLatLng,
  parseLatLng,
  walkingMinutes,
} from "./geo";

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

  it("uses the language's decimal separator", () => {
    expect(formatDistance(1.26, "nl")).toBe("1,3 km");
    expect(formatDistance(1.26, "fr")).toBe("1,3 km");
    expect(formatDistance(0.234, "nl")).toBe("230 m");
  });
});

describe("walkingMinutes", () => {
  it("allows for streets not being straight", () => {
    // 400 m as the crow flies ≈ 520 m on foot ≈ 6.5 minutes.
    expect(walkingMinutes(0.4)).toBe(7);
    expect(walkingMinutes(1)).toBe(16);
  });

  it("never says zero minutes", () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(0.02)).toBe(1);
  });
});

describe("parseLatLng", () => {
  it("reads coordinates from a shared link", () => {
    expect(parseLatLng("51.04758,3.72795")).toEqual({ lat: 51.04758, lng: 3.72795 });
    expect(parseLatLng(formatLatLng({ lat: 51.0475764, lng: 3.7272932 }))).toEqual({
      lat: 51.04758,
      lng: 3.72729,
    });
  });

  it("rejects anything that isn't a point in or around Ghent", () => {
    expect(parseLatLng("48.8566,2.3522")).toBeNull(); // Paris
    expect(parseLatLng("3.72795,51.04758")).toBeNull(); // swapped
    expect(parseLatLng("51.04758")).toBeNull();
    expect(parseLatLng("abc,def")).toBeNull();
    expect(parseLatLng("51.04758,3.72795,7")).toBeNull();
    expect(parseLatLng("")).toBeNull();
    expect(parseLatLng(null)).toBeNull();
  });
});
