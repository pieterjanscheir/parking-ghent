import { describe, expect, it } from "vitest";
import { machinesUrl, nearestMachine } from "./pay-machines";

const SPOT = { lat: 51.04292, lng: 3.72988 };
const machine = (over: Record<string, unknown> = {}) => ({
  straat: "Muinklaan",
  huisnr: "14",
  betaalmodus: "Cashless",
  status: "Actief",
  geo_point_2d: { lon: 3.729876, lat: 51.042919 },
  ...over,
});

describe("machinesUrl", () => {
  it("asks for the pay machines within 250 m of the spot", () => {
    const url = new URL(machinesUrl(SPOT));
    expect(url.pathname).toContain("/locaties-parkeerautomaten-gent/records");
    expect(url.searchParams.get("where")).toBe(
      "within_distance(geo_point_2d, geom'POINT(3.72988 51.04292)', 250m)",
    );
  });
});

describe("nearestMachine", () => {
  it("picks the nearest machine in service", () => {
    const results = [
      machine({ straat: "Buffelstraat", huisnr: "1", geo_point_2d: { lon: 3.729724, lat: 51.04375 } }),
      machine(),
      machine({ straat: "Muinkkaai", huisnr: "75", geo_point_2d: { lon: 3.729259, lat: 51.042524 } }),
    ];
    expect(nearestMachine({ results }, SPOT)).toEqual({ address: "Muinklaan 14", cash: false, metres: 0 });
  });

  it("says when a machine takes cash", () => {
    expect(nearestMachine({ results: [machine({ betaalmodus: "Cash" })] }, SPOT)?.cash).toBe(true);
  });

  it("skips machines that are being removed or can't be read", () => {
    const results = [
      machine({ status: "Gepland verwijderd" }),
      machine({ straat: null }),
      machine({ geo_point_2d: null }),
      "junk",
      machine({ straat: "Hofstraat", huisnr: null, geo_point_2d: { lon: 3.7312, lat: 51.0436 } }),
    ];
    expect(nearestMachine({ results }, SPOT)).toEqual({ address: "Hofstraat", cash: false, metres: 120 });
  });

  it("has nothing to say when no machine is near", () => {
    expect(nearestMachine({ total_count: 0, results: [] }, SPOT)).toBeNull();
    expect(nearestMachine({ error_code: "ODSQLError" }, SPOT)).toBeNull();
    expect(nearestMachine(null, SPOT)).toBeNull();
  });
});
