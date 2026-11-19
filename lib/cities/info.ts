import { knownPlaces, normalizeSearch, searchKnownPlaces, type Place } from "../destinations";
import type { LatLng } from "../geo";

// What the site knows about a city, apart from its live data. Plain facts,
// safe to use anywhere; fetching lives in lib/cities/index.ts.
//
// A city is a plug-in: to add one, describe it here and write a loader that
// turns its feed into the same `Parking` list Ghent uses. Everything built
// on that list (best choice, the MCP tools) then works for it unchanged.

export const CITY_IDS = ["ghent", "strasbourg"] as const;
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
  // Whether this site has pages for the city's car parks to link to.
  hasPages: boolean;
  // What the city's data tells us. Where it is false, the answer is
  // "unknown", never "no".
  knows: {
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
  hasPages: true,
  knows: { parkAndRide: true, price: true, charging: true, lowEmissionZone: true, forecast: true, typical: true },
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
  // Through the MCP tools only, for now.
  hasPages: false,
  // The live feed lists names and counts only. Strasbourg does have Park &
  // Ride sites (Rotonde, Baggersee, Elsau…), but the data doesn't mark them.
  knows: {
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

export const CITY_INFO: Record<CityId, CityInfo> = { ghent: GHENT, strasbourg: STRASBOURG };

export function inBounds(point: LatLng, bounds: Bounds): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}
