import { describe, expect, it } from "vitest";
import {
  POPULAR_COUNT,
  knownPlaces,
  normalizeSearch,
  searchKnownPlaces,
} from "./destinations";
import { parseLatLng, formatLatLng } from "./geo";

const names = (query: string) => searchKnownPlaces(query).map((p) => p.name);

describe("normalizeSearch", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeSearch("Château des  Comtes!")).toBe("chateau des comtes");
    expect(normalizeSearch("  S.M.A.K. ")).toBe("s m a k");
    expect(normalizeSearch("'t Kuipke")).toBe("t kuipke");
  });
});

describe("searchKnownPlaces", () => {
  it("offers the most popular places before anything is typed", () => {
    const places = searchKnownPlaces("");
    expect(places).toHaveLength(POPULAR_COUNT);
    expect(places[0].name).toBe("Gravensteen");
  });

  it("matches from the first letters typed", () => {
    expect(names("grav")[0]).toBe("Gravensteen");
    expect(names("koren")[0]).toBe("Korenmarkt");
  });

  it("finds a place by its old or everyday name", () => {
    expect(names("vooruit")).toContain("VIERNULVIER (Vooruit)");
    expect(names("ghelamco")).toEqual(["Planet Group Arena (KAA Gent)"]);
    expect(names("smak")).toEqual(["S.M.A.K."]);
  });

  it("finds a place by its English or French name, with or without accents", () => {
    expect(names("castle of the counts")).toEqual(["Gravensteen"]);
    expect(names("chateau des comtes")).toEqual(["Gravensteen"]);
    expect(names("belfry")).toEqual(["Belfort"]);
    expect(names("cathedrale")).toEqual(["Sint-Baafskathedraal"]);
  });

  it("matches a word in the middle of a name", () => {
    expect(names("dampoort")).toContain("Station Gent-Dampoort");
    expect(names("krook")).toEqual(["De Krook"]);
  });

  it("puts a match on the name before a match on a hidden alias", () => {
    // "station" starts two names and is only an alias-like word for others.
    const results = names("station");
    expect(results.slice(0, 2)).toEqual([
      "Station Gent-Sint-Pieters",
      "Station Gent-Dampoort",
    ]);
  });

  it("lists every hospital for a generic word", () => {
    expect(names("ziekenhuis").sort()).toEqual(
      ["AZ Maria Middelares", "AZ Sint-Lucas", "UZ Gent"].sort(),
    );
  });

  it("returns nothing for something that isn't on the list", () => {
    expect(searchKnownPlaces("zzzz")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchKnownPlaces("s", 3)).toHaveLength(3);
  });
});

describe("the list of well-known places", () => {
  const places = knownPlaces();

  it("has unique ids and names", () => {
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
    expect(new Set(places.map((p) => p.name)).size).toBe(places.length);
  });

  it("only contains points that survive a round trip through a shared link", () => {
    for (const place of places) {
      expect(parseLatLng(formatLatLng(place)), place.name).toEqual({
        lat: place.lat,
        lng: place.lng,
      });
    }
  });
});
