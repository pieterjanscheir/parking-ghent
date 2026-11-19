import { describe, expect, it } from "vitest";
import type { Place } from "./destinations";
import { MAX_RECENT, parseRecent, withRecent } from "./recent-destinations";

const place = (name: string, lat = 51.0478, lng = 3.7279): Place => ({ id: "x", name, detail: "", lat, lng });

describe("parseRecent", () => {
  it("reads back stored places", () => {
    const raw = JSON.stringify([{ name: "Vooruit", detail: "Sint-Pietersnieuwstraat 23", lat: 51.0478, lng: 3.7279 }]);
    expect(parseRecent(raw)).toEqual([
      { id: "recent-0-51.04780,3.72790", name: "Vooruit", detail: "Sint-Pietersnieuwstraat 23", lat: 51.0478, lng: 3.7279 },
    ]);
  });

  it("drops entries it cannot use and keeps the rest", () => {
    const raw = JSON.stringify([
      { name: "", lat: 51.05, lng: 3.72 },
      { name: "Paris", lat: 48.85, lng: 2.35 },
      { name: "No position" },
      "junk",
      null,
      { name: "Gravensteen", lat: 51.05718, lng: 3.72077 },
    ]);
    expect(parseRecent(raw)?.map((p) => p.name)).toEqual(["Gravensteen"]);
  });

  it("keeps four at most", () => {
    const raw = JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ name: `Place ${i}`, lat: 51.05, lng: 3.72 })));
    expect(parseRecent(raw)).toHaveLength(MAX_RECENT);
  });

  it("rejects what isn't a list", () => {
    expect(parseRecent("{oops")).toBeNull();
    expect(parseRecent('{"name":"Vooruit"}')).toBeNull();
  });
});

describe("withRecent", () => {
  it("puts the newest first", () => {
    expect(withRecent([place("Vooruit")], place("Gravensteen")).map((p) => p.name)).toEqual(["Gravensteen", "Vooruit"]);
  });

  it("moves a place picked again to the front instead of listing it twice", () => {
    const list = [place("Vooruit"), place("Gravensteen"), place("Korenmarkt")];
    expect(withRecent(list, place("gravensteen ")).map((p) => p.name)).toEqual(["gravensteen ", "Vooruit", "Korenmarkt"]);
  });

  it("keeps two places that share a name but not a position", () => {
    const list = [place("Kerkstraat", 51.05, 3.72)];
    expect(withRecent(list, place("Kerkstraat", 51.08, 3.75))).toHaveLength(2);
  });

  it("drops the oldest beyond four", () => {
    const list = [place("A"), place("B"), place("C"), place("D")];
    expect(withRecent(list, place("E")).map((p) => p.name)).toEqual(["E", "A", "B", "C"]);
  });
});
