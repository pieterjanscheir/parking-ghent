import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeInGhent, geocodeUrl, parseGeocodeResponse } from "./geocode";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Shaped like a real Nominatim answer for "Vooruit" (trimmed).
const VOORUIT = [
  {
    place_id: 1,
    lat: "51.0574764",
    lon: "3.7416449",
    name: "Vooruit",
    display_name: "Vooruit, 4, Antwerpsesteenweg, Dampoortwijk, Gent",
    address: { amenity: "Vooruit", house_number: "4", road: "Antwerpsesteenweg", suburb: "Dampoortwijk", city: "Gent" },
  },
  {
    place_id: 2,
    lat: "51.0475764",
    lon: "3.7272932",
    name: "Vooruit",
    display_name: "Vooruit, Sint-Pietersnieuwstraat, Kunstenkwartier, Gent",
    address: { road: "Sint-Pietersnieuwstraat", neighbourhood: "Kunstenkwartier", suburb: "Muinkparkwijk" },
  },
  {
    place_id: 3,
    lat: "51.0474650",
    lon: "3.7273368",
    name: "Vooruit",
    display_name: "Vooruit, Sint-Pietersnieuwstraat, Kunstenkwartier, Gent",
    address: { road: "Sint-Pietersnieuwstraat", neighbourhood: "Kunstenkwartier", suburb: "Muinkparkwijk" },
  },
];

describe("geocodeUrl", () => {
  const url = new URL(geocodeUrl("Sint-Pietersnieuwstraat 120", "fr"));

  it("asks OpenStreetMap's search service", () => {
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Sint-Pietersnieuwstraat 120");
  });

  it("only accepts results inside Ghent", () => {
    expect(url.searchParams.get("bounded")).toBe("1");
    expect(url.searchParams.get("viewbox")).toBe("3.58,51.19,3.85,50.98");
    expect(url.searchParams.get("countrycodes")).toBe("be");
  });

  it("asks for names in the visitor's language", () => {
    expect(url.searchParams.get("accept-language")).toBe("fr");
  });
});

describe("parseGeocodeResponse", () => {
  it("turns results into places with a line that tells them apart", () => {
    const places = parseGeocodeResponse(VOORUIT);
    expect(places[0]).toEqual({
      id: "osm-1",
      name: "Vooruit",
      detail: "Antwerpsesteenweg 4, Dampoortwijk",
      lat: 51.0574764,
      lng: 3.7416449,
    });
    expect(places[1].detail).toBe("Sint-Pietersnieuwstraat, Kunstenkwartier");
  });

  it("drops repeats of the same name on the same street", () => {
    expect(parseGeocodeResponse(VOORUIT)).toHaveLength(2);
  });

  it("falls back to the first part of the full address when there is no name", () => {
    const [place] = parseGeocodeResponse([
      { place_id: 9, lat: "51.05", lon: "3.72", name: "", display_name: "Veldstraat, Gent, België", address: { road: "Veldstraat" } },
    ]);
    expect(place.name).toBe("Veldstraat");
    // The street is the name already, so it isn't repeated as the detail.
    expect(place.detail).toBe("");
  });

  it("names a plain address by its street, not by its bare house number", () => {
    const [place] = parseGeocodeResponse([
      {
        place_id: 7,
        lat: "51.04738",
        lon: "3.72699",
        name: "120",
        display_name: "120, Sint-Pietersnieuwstraat, Kunstenkwartier, Gent",
        address: { house_number: "120", road: "Sint-Pietersnieuwstraat", neighbourhood: "Kunstenkwartier" },
      },
    ]);
    expect(place.name).toBe("Sint-Pietersnieuwstraat 120");
    expect(place.detail).toBe("Kunstenkwartier");
  });

  it("keeps a real name that happens to contain digits", () => {
    const [place] = parseGeocodeResponse([
      { place_id: 8, lat: "51.05", lon: "3.72", name: "Café 1900", display_name: "Café 1900, Gent", address: { road: "Kouter", house_number: "3" } },
    ]);
    expect(place.name).toBe("Café 1900");
  });

  it("skips results without usable coordinates", () => {
    expect(
      parseGeocodeResponse([{ place_id: 9, lat: "abc", lon: "3.72", name: "X" }]),
    ).toEqual([]);
  });

  it("rejects an answer that isn't a list of results", () => {
    expect(() => parseGeocodeResponse({ error: "Bad request" })).toThrow();
  });
});

describe("geocodeInGhent", () => {
  it("doesn't call the service for very short input", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocodeInGhent(" ab ", "nl")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the places the service found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VOORUIT))));
    const places = await geocodeInGhent("Vooruit", "nl");
    expect(places.map((p) => p.name)).toEqual(["Vooruit", "Vooruit"]);
  });

  it("fails loudly when the service refuses, so the UI can say so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 429 })));
    await expect(geocodeInGhent("Vooruit", "nl")).rejects.toThrow("429");
  });
});
