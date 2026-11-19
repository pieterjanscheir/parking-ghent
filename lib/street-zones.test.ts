import { describe, expect, it } from "vitest";
import { STREET_RATES_URL, parseStreetZones, zoneAt } from "./street-zones";

// A square around a point, as the city's data draws zones: [lng, lat] rings
// that close on their first corner.
function square(lng: number, lat: number, half: number): [number, number][] {
  return [
    [lng - half, lat - half],
    [lng + half, lat - half],
    [lng + half, lat + half],
    [lng - half, lat + half],
    [lng - half, lat - half],
  ];
}

function record(id: string, coordinates: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id,
    zone: "…",
    url: "https://stad.gent/nl/mobiliteit-openbare-werken/parkeren/parkeren-op-straat/parkeertarieven-op-straat",
    geometry: { type: "Feature", geometry: { type: "Polygon", coordinates }, properties: {} },
    ...overrides,
  };
}

const parse = (...records: unknown[]) => parseStreetZones({ total_count: records.length, results: records });

const GRAVENSTEEN = { lat: 51.05718, lng: 3.72077 };

describe("parseStreetZones", () => {
  it("reads the colour, the city's link and the outline", () => {
    const [zone] = parse(record("TARROOD", [square(3.72, 51.057, 0.01)]));
    expect(zone.color).toBe("red");
    expect(zone.url).toMatch(/^https:\/\/stad\.gent\//);
    expect(zone.polygons).toHaveLength(1);
    expect(zone.polygons[0][0]).toHaveLength(5);
  });

  it("knows the five zone colours and skips anything else", () => {
    const outline = [square(3.72, 51.057, 0.01)];
    const zones = parse(
      record("TARROOD", outline),
      record("TARORANJE", outline),
      record("TARGEEL", outline),
      record("TARGROEN", outline),
      record("TARBLAUW", outline),
      record("TARPAARS", outline),
      { id: "TARROOD" },
      "junk",
    );
    expect(zones.map((z) => z.color)).toEqual(["red", "orange", "yellow", "green", "blue"]);
  });

  it("reads a zone made of several separate areas", () => {
    const multi = record("TARGEEL", null, {
      geometry: {
        geometry: {
          type: "MultiPolygon",
          coordinates: [[square(3.7, 51.03, 0.005)], [square(3.74, 51.06, 0.005)]],
        },
      },
    });
    expect(parse(multi)[0].polygons).toHaveLength(2);
  });

  it("only links to the city's own site", () => {
    const outline = [square(3.72, 51.057, 0.01)];
    const [elsewhere, plainHttp, missing] = parse(
      record("TARROOD", outline, { url: "https://example.com/parking" }),
      record("TARROOD", outline, { url: "http://stad.gent/parkeren" }),
      record("TARROOD", outline, { url: null }),
    );
    expect([elsewhere.url, plainHttp.url, missing.url]).toEqual([
      STREET_RATES_URL,
      STREET_RATES_URL,
      STREET_RATES_URL,
    ]);
  });

  it("rejects a response that isn't a list", () => {
    expect(() => parseStreetZones({ error_code: "nope" })).toThrow();
  });
});

describe("zoneAt", () => {
  const red = parse(record("TARROOD", [square(3.72, 51.057, 0.01)]))[0];

  it("finds the zone a spot is in", () => {
    expect(zoneAt([red], GRAVENSTEEN)).toEqual({ color: "red", url: red.url });
  });

  it("returns null outside every zone", () => {
    expect(zoneAt([red], { lat: 51.1, lng: 3.8 })).toBeNull();
    expect(zoneAt([], GRAVENSTEEN)).toBeNull();
  });

  it("respects a hole in a zone", () => {
    const withHole = parse(
      record("TARGROEN", [square(3.72, 51.057, 0.02), square(3.72077, 51.05718, 0.002)]),
    );
    expect(zoneAt(withHole, GRAVENSTEEN)).toBeNull();
    expect(zoneAt(withHole, { lat: 51.07, lng: 3.73 })).toMatchObject({ color: "green" });
  });

  it("reports the strictest zone where zones overlap", () => {
    const zones = parse(
      record("TARBLAUW", [square(3.72, 51.057, 0.03)]),
      record("TARGEEL", [square(3.72, 51.057, 0.02)]),
      record("TARROOD", [square(3.72, 51.057, 0.01)]),
    );
    expect(zoneAt(zones, GRAVENSTEEN)?.color).toBe("red");
    expect(zoneAt(zones, { lat: 51.072, lng: 3.72 })?.color).toBe("yellow");
    expect(zoneAt(zones, { lat: 51.082, lng: 3.72 })?.color).toBe("blue");
  });

  it("matches the city's real outlines for well-known places", () => {
    // A zone shaped like the real red zone's rough extent around the centre.
    const centre = parse(
      record("TARROOD", [
        [
          [3.712, 51.046],
          [3.735, 51.045],
          [3.737, 51.06],
          [3.715, 51.062],
          [3.712, 51.046],
        ],
      ]),
    );
    expect(zoneAt(centre, GRAVENSTEEN)?.color).toBe("red");
    expect(zoneAt(centre, { lat: 51.03562, lng: 3.7107 })).toBeNull();
  });
});
