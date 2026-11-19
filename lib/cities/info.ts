import { knownPlaces, normalizeSearch, searchKnownPlaces, type Place } from "../destinations";
import type { LatLng } from "../geo";

// What the site knows about a city, apart from its live data. Plain facts,
// safe to use anywhere; fetching lives in lib/cities/index.ts.
//
// A city is a plug-in: to add one, describe it here and write a loader that
// turns its feed into the same `Parking` list Ghent uses. Everything built
// on that list (best choice, the MCP tools) then works for it unchanged.

export const CITY_IDS = ["ghent", "hasselt", "antwerp", "brussels", "liege", "namur", "strasbourg"] as const;
export type CityId = (typeof CITY_IDS)[number];

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export type CityInfo = {
  id: CityId;
  name: string;
  country: string;
  center: LatLng;
  // Coordinates outside this box aren't in or around the city.
  bounds: Bounds;
  // Whose data it is, for the credit line.
  source: string;
  // The publisher under its own name, for the pages: needs no translation.
  publisher: string;
  // False where the figures come from a city's website rather than from a
  // feed it publishes for reuse: they can stop working without notice.
  openData: boolean;
  // Whether this site has pages for the city's car parks to link to.
  hasPages: boolean;
  // What the city's data tells us. Where it is false, the answer is
  // "unknown", never "no".
  knows: {
    // How many spaces are free right now. Without it the city only lists
    // where its car parks are and how big.
    liveCounts: boolean;
    // Which car parks are Park & Ride.
    parkAndRide: boolean;
    // Whether a car park is free of charge.
    price: boolean;
    // How many charge points a car park has.
    charging: boolean;
    // Whether a car park lies inside the low-emission zone.
    lowEmissionZone: boolean;
    // A forecast for the next hour.
    forecast: boolean;
    // What is usual at an hour of the week.
    typical: boolean;
  };
  // A well-known place by (part of) its name, or null.
  findPlace: (text: string) => Place | null;
  placeNames: () => string[];
};

export const GHENT: CityInfo = {
  id: "ghent",
  name: "Ghent",
  country: "Belgium",
  center: { lat: 51.0543, lng: 3.7174 },
  // The same box lib/geo.ts uses for destinations in shared links.
  bounds: { minLat: 50.9, maxLat: 51.3, minLng: 3.5, maxLng: 3.95 },
  source: "City of Ghent open data",
  publisher: "Stad Gent",
  openData: true,
  hasPages: true,
  knows: {
    liveCounts: true,
    parkAndRide: true,
    price: true,
    charging: true,
    lowEmissionZone: true,
    forecast: true,
    typical: true,
  },
  // A name with nothing to search for ("!!!") must not fall back to the list
  // of popular places.
  findPlace: (text) => (normalizeSearch(text) ? (searchKnownPlaces(text, 1)[0] ?? null) : null),
  placeNames: () => knownPlaces().map((place) => place.name),
};

export const STRASBOURG: CityInfo = {
  id: "strasbourg",
  name: "Strasbourg",
  country: "France",
  center: { lat: 48.5839, lng: 7.7455 },
  bounds: { minLat: 48.45, maxLat: 48.7, minLng: 7.55, maxLng: 7.95 },
  source: "Eurométropole de Strasbourg open data (Licence Ouverte)",
  publisher: "Eurométropole de Strasbourg",
  openData: true,
  // Through the MCP tools only, for now.
  hasPages: false,
  // The live feed lists names and counts only. Strasbourg does have Park &
  // Ride sites (Rotonde, Baggersee, Elsau…), but the data doesn't mark them.
  knows: {
    liveCounts: true,
    parkAndRide: false,
    price: false,
    charging: false,
    lowEmissionZone: false,
    forecast: false,
    typical: false,
  },
  // No list of well-known places yet: destinations go by coordinates.
  findPlace: () => null,
  placeNames: () => [],
};

// A city reached through the MCP tools only, with no history kept and no
// places known by name. `knows` says what its data does tell.
function mcpOnly(
  city: Pick<
    CityInfo,
    "id" | "name" | "country" | "center" | "bounds" | "source" | "publisher" | "openData"
  > & {
    knows: Pick<CityInfo["knows"], "liveCounts" | "parkAndRide">;
  },
): CityInfo {
  return {
    ...city,
    hasPages: false,
    knows: {
      ...city.knows,
      price: false,
      charging: false,
      lowEmissionZone: false,
      forecast: false,
      typical: false,
    },
    findPlace: () => null,
    placeNames: () => [],
  };
}

// The bounds below are boxes drawn around each city, not official limits.

// Live counts, from the files the city's own website reads. Not published as
// open data: see lib/cities/hasselt.ts.
export const HASSELT = mcpOnly({
  id: "hasselt",
  name: "Hasselt",
  country: "Belgium",
  center: { lat: 50.9307, lng: 5.3378 },
  bounds: { minLat: 50.85, maxLat: 51.0, minLng: 5.22, maxLng: 5.45 },
  source: "City of Hasselt (hasselt.be), counts supplied by Be-Mobile",
  publisher: "Stad Hasselt · Be-Mobile",
  openData: false,
  // Its Park & Ride sites are named as such.
  knows: { liveCounts: true, parkAndRide: true },
});

// The four below publish where their car parks are and how big, not how
// full: see lib/cities/belgium-static.ts.
export const ANTWERP = mcpOnly({
  id: "antwerp",
  name: "Antwerp",
  country: "Belgium",
  center: { lat: 51.2194, lng: 4.4025 },
  bounds: { minLat: 51.1, maxLat: 51.4, minLng: 4.2, maxLng: 4.6 },
  source: "City of Antwerp open geodata",
  publisher: "Stad Antwerpen",
  openData: true,
  knows: { liveCounts: false, parkAndRide: true },
});

export const BRUSSELS = mcpOnly({
  id: "brussels",
  name: "Brussels",
  country: "Belgium",
  center: { lat: 50.8467, lng: 4.3525 },
  bounds: { minLat: 50.75, maxLat: 50.95, minLng: 4.22, maxLng: 4.5 },
  source: "parking.brussels, the Brussels regional parking agency",
  publisher: "parking.brussels",
  openData: true,
  knows: { liveCounts: false, parkAndRide: true },
});

export const LIEGE = mcpOnly({
  id: "liege",
  name: "Liège",
  country: "Belgium",
  center: { lat: 50.6451, lng: 5.5734 },
  bounds: { minLat: 50.55, maxLat: 50.72, minLng: 5.45, maxLng: 5.7 },
  source: "City of Liège open data",
  publisher: "Ville de Liège",
  openData: true,
  knows: { liveCounts: false, parkAndRide: true },
});

export const NAMUR = mcpOnly({
  id: "namur",
  name: "Namur",
  country: "Belgium",
  center: { lat: 50.4649, lng: 4.865 },
  bounds: { minLat: 50.38, maxLat: 50.54, minLng: 4.75, maxLng: 4.98 },
  source: "City of Namur open data",
  publisher: "Ville de Namur",
  openData: true,
  knows: { liveCounts: false, parkAndRide: true },
});

export const CITY_INFO: Record<CityId, CityInfo> = {
  ghent: GHENT,
  hasselt: HASSELT,
  antwerp: ANTWERP,
  brussels: BRUSSELS,
  liege: LIEGE,
  namur: NAMUR,
  strasbourg: STRASBOURG,
};

export function inBounds(point: LatLng, bounds: Bounds): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}
