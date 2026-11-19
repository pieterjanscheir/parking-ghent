import { describe, expect, it } from "vitest";
import { chargingByPlace, parseChargePoints, type ChargePoint } from "./chargers";

describe("parseChargePoints", () => {
  it("reads position and power", () => {
    const { total, points } = parseChargePoints({
      total_count: 87,
      results: [
        { kw: 22, geo_point_2d: { lat: 51.0488, lon: 3.7237 } },
        { kw: null, geo_point_2d: { lat: 51.05, lon: 3.72 } },
        { kw: 11 },
        "junk",
      ],
    });
    expect(total).toBe(87);
    expect(points).toEqual([
      { lat: 51.0488, lng: 3.7237, kw: 22 },
      { lat: 51.05, lng: 3.72, kw: null },
    ]);
  });

  it("rejects a response that isn't a list", () => {
    expect(() => parseChargePoints({ message: "error" })).toThrow();
  });
});

describe("chargingByPlace", () => {
  const savaan = { id: "parking-savaan", lat: 51.04877, lng: 3.72395 };
  // A different garage about 150 m north of Savaan.
  const kouter = { id: "p-kouter", lat: 51.05012, lng: 3.72365 };
  const at = (lat: number, lng: number, kw: number | null = 22): ChargePoint => ({ lat, lng, kw });

  it("counts the charge points inside a garage and reports the fastest", () => {
    const points = [at(51.0489, 3.7238, 11), at(51.049, 3.724, 22), at(51.0487, 3.7241, null)];
    expect(chargingByPlace(points, [savaan])).toEqual({
      "parking-savaan": { count: 3, maxKw: 22 },
    });
  });

  it("counts each charge point once, for the nearest garage", () => {
    // Roughly halfway, slightly closer to Kouter.
    const between = at(51.04955, 3.7238);
    expect(chargingByPlace([between], [savaan, kouter])).toEqual({
      "p-kouter": { count: 1, maxKw: 22 },
    });
  });

  it("leaves out charge points that aren't near any garage", () => {
    expect(chargingByPlace([at(51.06, 3.74)], [savaan, kouter])).toEqual({});
  });

  it("skips garages without a position", () => {
    const noPin = { id: "parking-reep", lat: null, lng: null };
    expect(chargingByPlace([at(51.0489, 3.7238)], [noPin])).toEqual({});
  });

  it("reports unknown power as null", () => {
    expect(chargingByPlace([at(51.0489, 3.7238, null)], [savaan])).toEqual({
      "parking-savaan": { count: 1, maxKw: null },
    });
  });
});

describe("parseChargeStations", () => {
  const point = (lat: number, lon: number, overrides: Record<string, unknown> = {}) => ({
    straatnaam: "Tondelierlaan",
    cpo: "Total",
    kw: 22,
    status: "In dienst",
    geo_point_2d: { lat, lon },
    ...overrides,
  });

  it("merges the sockets of one post into one station", async () => {
    const { parseChargeStations } = await import("./chargers");
    const stations = parseChargeStations([
      point(51.064766, 3.716224),
      point(51.064768, 3.716226, { kw: 11 }),
      point(51.0489, 3.7238, { straatnaam: "Savaanstraat", cpo: "Allego", kw: 120 }),
    ]);
    expect(stations).toEqual([
      { lat: 51.06477, lng: 3.71622, count: 2, maxKw: 22, street: "Tondelierlaan", operator: "Total" },
      { lat: 51.0489, lng: 3.7238, count: 1, maxKw: 120, street: "Savaanstraat", operator: "Allego" },
    ]);
  });

  it("leaves out charge points that are out of service, and unreadable records", async () => {
    const { parseChargeStations } = await import("./chargers");
    const stations = parseChargeStations([
      point(51.06, 3.71, { status: "Buiten dienst" }),
      { straatnaam: "No position" },
      "junk",
      point(51.05, 3.72, { kw: null, cpo: null, straatnaam: null }),
    ]);
    expect(stations).toEqual([
      { lat: 51.05, lng: 3.72, count: 1, maxKw: null, street: "", operator: "" },
    ]);
  });

  it("rejects a response that isn't a list", async () => {
    const { parseChargeStations } = await import("./chargers");
    expect(() => parseChargeStations({ error_code: "nope" })).toThrow();
  });
});
