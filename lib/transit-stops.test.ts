import { describe, expect, it } from "vitest";
import { nearestStops, stopsUrl } from "./transit-stops";

const WATERSPORTBAAN = { lat: 51.04901, lng: 3.6905 };
const stop = (omschrijving: string, bedieningstypes: string | null, lon: number, lat: number) => ({
  omschrijving,
  bedieningstypes,
  locatie: { lon, lat },
});

describe("stopsUrl", () => {
  it("asks for the stops within 400 m", () => {
    const url = new URL(stopsUrl(WATERSPORTBAAN));
    expect(url.pathname).toContain("/bushaltes-gent/records");
    expect(url.searchParams.get("where")).toBe(
      "within_distance(locatie, geom'POINT(3.69050 51.04901)', 400m)",
    );
  });
});

describe("nearestStops", () => {
  it("lists the nearest stops in use, nearest first", () => {
    const results = [
      stop("Topsporthal Vlaanderen", "BUS", 3.6852, 51.0498),
      stop("Annie Vande Wielebrug", null, 3.693338, 51.049355),
      stop("P+R Watersportbaan", "BUS", 3.68837, 51.04914),
      stop("Vissersdijk", "BUS", 3.69502, 51.04792),
      stop("Blaarmeersen (Rugbylaan)", "BUS", 3.6869, 51.0478),
    ];
    expect(nearestStops({ results }, WATERSPORTBAAN)).toEqual([
      { name: "P+R Watersportbaan", bus: true, tram: false, metres: 150 },
      { name: "Blaarmeersen (Rugbylaan)", bus: true, tram: false, metres: 290 },
      { name: "Vissersdijk", bus: true, tram: false, metres: 340 },
      { name: "Topsporthal Vlaanderen", bus: true, tram: false, metres: 380 },
    ]);
  });

  it("stops at four", () => {
    const results = Array.from({ length: 7 }, (_, i) => stop(`Stop ${i}`, "BUS", 3.6905 + i * 0.0005, 51.049));
    expect(nearestStops({ results }, WATERSPORTBAAN).map((s) => s.name)).toEqual([
      "Stop 0",
      "Stop 1",
      "Stop 2",
      "Stop 3",
    ]);
  });

  it("shows a stop once, with everything that calls there", () => {
    const results = [
      stop("Nieuwevaartbrug", "BUS", 3.6915, 51.0492),
      stop("Nieuwevaartbrug", "BUS;TRAM", 3.6906, 51.0491),
    ];
    expect(nearestStops({ results }, WATERSPORTBAAN)).toEqual([
      { name: "Nieuwevaartbrug", bus: true, tram: true, metres: 10 },
    ]);
  });

  it("returns nothing for an empty or unexpected answer", () => {
    expect(nearestStops({ total_count: 0, results: [] }, WATERSPORTBAAN)).toEqual([]);
    expect(nearestStops({ results: ["junk", stop("", "BUS", 3.69, 51.049), stop("X", "BUS", NaN, 51)] }, WATERSPORTBAAN)).toEqual([]);
    expect(nearestStops(null, WATERSPORTBAAN)).toEqual([]);
  });
});
