import { describe, expect, it } from "vitest";
import { parseApproachRoutes, routesForGarage } from "./approach-routes";

// Records as the city publishes them, with short made-up lines.
function record(van: string | null, naar: string | null, coordinates: number[][] = [
  [3.7139, 51.06123],
  [3.71422, 51.06148],
]) {
  return {
    van,
    naar,
    geometry: { type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} },
  };
}

describe("parseApproachRoutes", () => {
  it("reads which garages a segment serves and its line as [lat, lng]", () => {
    const [segment] = parseApproachRoutes([record("R40 FT", "P Sint Michiels, P Ramen")]);
    expect(segment.garages).toEqual(["sintmichiels", "ramen"]);
    expect(segment.line).toEqual([
      [51.06123, 3.7139],
      [51.06148, 3.71422],
    ]);
  });

  it("finds the garage on either side, also in a two-way label", () => {
    const segments = parseApproachRoutes([
      record("P Reep", "R40 TF"),
      record("R40 FT - P Vrijdagmarkt", "P Vrijdagmarkt - R40 TF"),
      record("R40, B401 TF", "P Reep, P Zuid, P Kouter, P Center"),
    ]);
    expect(segments.map((s) => s.garages)).toEqual([
      ["reep"],
      ["vrijdagmarkt"],
      ["reep", "zuid", "kouter", "center"],
    ]);
  });

  it("reads the misspelt label too", () => {
    expect(parseApproachRoutes([record("Psintmichiels, Pramen", "R40 FT")])[0].garages).toEqual([
      "sintmichiels",
      "ramen",
    ]);
  });

  it("skips segments that mention no garage, and records it can't read", () => {
    const segments = parseApproachRoutes([
      record("R40 FT", "B401 TF"),
      record(null, null),
      { van: "P Reep", naar: "R40 FT" },
      "junk",
      record("P Reep", "R40 FT", [[3.73, 51.05]]),
      record("P Savaan", "R40 TF"),
    ]);
    expect(segments.map((s) => s.garages)).toEqual([["savaan"]]);
  });

  it("rounds coordinates to about a metre", () => {
    const [segment] = parseApproachRoutes([
      record("P Reep", "R40 TF", [
        [3.737126580758114, 51.04868201095461],
        [3.737517824912099, 51.04880768798582],
      ]),
    ]);
    expect(segment.line).toEqual([
      [51.04868, 3.73713],
      [51.04881, 3.73752],
    ]);
  });

  it("rejects a response that isn't a list", () => {
    expect(() => parseApproachRoutes({ error_code: "nope" })).toThrow();
  });
});

describe("routesForGarage", () => {
  const segments = parseApproachRoutes([
    record("R40 FT", "P Sint Michiels, P Ramen"),
    record("P Sint Michiels, P Ramen", "R40 FT"),
    record("R40, B401 TF", "P Reep, P Zuid, P Kouter, P Center"),
    record("P Ledeberg", "B401 TF"),
  ]);

  it("matches the garage names the app shows", () => {
    expect(routesForGarage(segments, "Sint-Michiels")).toHaveLength(2);
    expect(routesForGarage(segments, "Ramen")).toHaveLength(2);
    expect(routesForGarage(segments, "Ledeberg")).toHaveLength(1);
    expect(routesForGarage(segments, "Center parking")).toHaveLength(1);
    expect(routesForGarage(segments, "Kouter")).toHaveLength(1);
  });

  it("doesn't confuse garages with similar names", () => {
    // "Zuid" has a route; "Zuiderpoort" is a different car park.
    expect(routesForGarage(segments, "Zuid")).toHaveLength(1);
    expect(routesForGarage(segments, "Zuiderpoort")).toEqual([]);
  });

  it("has nothing for a garage outside the centre", () => {
    expect(routesForGarage(segments, "B-Park Dampoort")).toEqual([]);
    expect(routesForGarage(segments, "P+R The Loop")).toEqual([]);
    expect(routesForGarage([], "Reep")).toEqual([]);
  });
});
