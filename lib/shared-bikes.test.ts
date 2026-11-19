import { describe, expect, it } from "vitest";
import { bikesUrl, countBikes, onwardRouteUrl } from "./shared-bikes";

const WATERSPORTBAAN = { lat: 51.049012345, lng: 3.690498765 };

describe("bikesUrl", () => {
  it("asks the city's portal for bikes within 400 m of the spot", () => {
    const url = new URL(bikesUrl("dott", WATERSPORTBAAN));
    expect(url.origin).toBe("https://gent.opendatasoft.com");
    expect(url.pathname).toBe("/api/explore/v2.1/catalog/datasets/dott-deelfietsen-gent/records");
    expect(url.searchParams.get("where")).toBe(
      "within_distance(loc, geom'POINT(3.69050 51.04901)', 400m) and is_disabled=0 and is_reserved=0",
    );
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("select")).toBe("is_disabled,is_reserved");
  });

  it("uses each operator's own dataset and position field", () => {
    expect(bikesUrl("donkey", WATERSPORTBAAN)).toContain(
      "donkey-republic-beschikbaarheid-deelfietsen-per-station",
    );
    expect(new URL(bikesUrl("donkey", WATERSPORTBAAN)).searchParams.get("where")).toContain(
      "within_distance(geopunt,",
    );
    expect(bikesUrl("bolt", WATERSPORTBAAN)).toContain("bolt-deelfietsen-gent");
  });

  it("asks only for bikes that can be taken, so the 100-record limit can't hide them", () => {
    const where = (provider: "donkey" | "dott" | "bolt") =>
      new URL(bikesUrl(provider, WATERSPORTBAAN)).searchParams.get("where") ?? "";
    expect(where("donkey")).toMatch(/ and is_renting=1$/);
    expect(where("bolt")).toMatch(/ and is_disabled=0 and is_reserved=0$/);
  });

  it("sends nothing but the position", () => {
    const url = new URL(bikesUrl("bolt", WATERSPORTBAAN));
    expect([...url.searchParams.keys()].sort()).toEqual(["limit", "select", "where"]);
  });
});

describe("countBikes", () => {
  it("adds up the bikes at Donkey Republic stations that are renting", () => {
    const json = {
      total_count: 4,
      results: [
        { num_bikes_available: 1, is_renting: 1 },
        { num_bikes_available: 0, is_renting: 1 },
        { num_bikes_available: 3, is_renting: 0 },
        { num_bikes_available: 2, is_renting: 1 },
      ],
    };
    expect(countBikes("donkey", json)).toEqual({ count: 3, atLeast: false });
  });

  it("counts free-floating bikes that are neither disabled nor reserved", () => {
    const json = {
      total_count: 4,
      results: [
        { is_disabled: 0, is_reserved: 0 },
        { is_disabled: 1, is_reserved: 0 },
        { is_disabled: 0, is_reserved: "1" },
        { is_disabled: 0, is_reserved: 0 },
      ],
    };
    expect(countBikes("dott", json)).toEqual({ count: 2, atLeast: false });
    expect(countBikes("bolt", json)).toEqual({ count: 2, atLeast: false });
  });

  it("says so when the portal had more bikes than it returned", () => {
    const results = Array.from({ length: 100 }, () => ({ is_disabled: 0, is_reserved: 0 }));
    expect(countBikes("dott", { total_count: 143, results })).toEqual({ count: 100, atLeast: true });
  });

  it("counts nothing from an empty or unexpected answer", () => {
    expect(countBikes("dott", { total_count: 0, results: [] })).toEqual({ count: 0, atLeast: false });
    expect(countBikes("donkey", { error_code: "ODSQLError" })).toEqual({ count: 0, atLeast: false });
    expect(countBikes("bolt", null)).toEqual({ count: 0, atLeast: false });
    expect(countBikes("donkey", { results: ["junk", { num_bikes_available: "many" }] })).toEqual({
      count: 0,
      atLeast: false,
    });
  });
});

describe("onwardRouteUrl", () => {
  it("asks for a route from the car park to the city centre", () => {
    const url = new URL(onwardRouteUrl({ lat: 51.049, lng: 3.6905 }, "transit"));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("51.04900,3.69050");
    expect(url.searchParams.get("destination")).toBe("51.0546,3.7219");
    expect(url.searchParams.get("travelmode")).toBe("transit");
    expect(new URL(onwardRouteUrl(WATERSPORTBAAN, "bicycling")).searchParams.get("travelmode")).toBe(
      "bicycling",
    );
  });
});
