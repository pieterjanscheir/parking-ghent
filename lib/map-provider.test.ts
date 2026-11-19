import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_PROVIDER, parseMapProvider } from "./map-provider";

describe("map provider setting", () => {
  it("defaults to OpenStreetMap, so nothing is loaded from Google unless chosen", () => {
    expect(DEFAULT_MAP_PROVIDER).toBe("osm");
  });

  it("reads back a stored choice", () => {
    expect(parseMapProvider(JSON.stringify("google"))).toBe("google");
    expect(parseMapProvider(JSON.stringify("osm"))).toBe("osm");
  });

  it("ignores anything that isn't a known provider", () => {
    expect(parseMapProvider(JSON.stringify("bing"))).toBeNull();
    expect(parseMapProvider(JSON.stringify(1))).toBeNull();
    expect(parseMapProvider("google")).toBeNull(); // not JSON
    expect(parseMapProvider("")).toBeNull();
  });
});
