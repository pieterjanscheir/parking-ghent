import { z } from "zod";
import type { Place } from "./destinations";

// Free-text place search for anything that isn't in the list of well-known
// destinations, using OpenStreetMap's Nominatim service.
//
// It is called straight from the visitor's browser, and only when they ask
// for it (pressing Enter or choosing "Search all of Ghent") — never while
// typing, which Nominatim's usage policy does not allow. So a search costs us
// nothing and is limited per visitor, not per server.
// https://operations.osmfoundation.org/policies/nominatim/

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

// West, north, east, south: the city of Ghent with a little margin. Results
// outside it are not returned ("bounded").
const GHENT_VIEWBOX = "3.58,51.19,3.85,50.98";

export const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 6;

const ResultSchema = z.object({
  place_id: z.number(),
  lat: z.string(),
  lon: z.string(),
  name: z.string().optional().default(""),
  display_name: z.string().optional().default(""),
  address: z.record(z.string(), z.string()).optional().default({}),
});

const ResponseSchema = z.array(ResultSchema);

export function geocodeUrl(query: string, locale: string): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(MAX_RESULTS),
    viewbox: GHENT_VIEWBOX,
    bounded: "1",
    countrycodes: "be",
    "accept-language": locale,
  });
  return `${ENDPOINT}?${params}`;
}

function streetLine(address: Record<string, string>): string {
  return address.road
    ? [address.road, address.house_number].filter(Boolean).join(" ")
    : "";
}

// A plain address has no name of its own: OpenStreetMap then "names" it by
// its house number ("120"), which says nothing on its own. Use the street
// line instead ("Sint-Pietersnieuwstraat 120").
function placeName(result: z.infer<typeof ResultSchema>): string {
  const raw = result.name.trim();
  const street = streetLine(result.address);
  const isJustANumber = raw === result.address.house_number || /^\d+\s?[a-z]?$/i.test(raw);
  if ((!raw || isJustANumber) && street) return street;
  return raw || result.display_name.split(",")[0].trim();
}

// "Sint-Pietersnieuwstraat 23, Kunstenkwartier" — enough to tell apart two
// results with the same name, without repeating "Gent, Oost-Vlaanderen, …".
function describe(name: string, address: Record<string, string>): string {
  const area = address.neighbourhood ?? address.suburb ?? address.city_district ?? "";
  return [streetLine(address), area]
    .filter((part) => part && part !== name)
    .join(", ");
}

export function parseGeocodeResponse(json: unknown): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const result of ResponseSchema.parse(json)) {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const name = placeName(result);
    if (!name) continue;
    const detail = describe(name, result.address);
    // The same place is often mapped several times (the building, its bike
    // racks, its car-sharing spot …). One line per name + street is enough.
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ id: `osm-${result.place_id}`, name, detail, lat, lng });
  }
  return places;
}

export async function geocodeInGhent(
  query: string,
  locale: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const res = await fetch(geocodeUrl(q, locale), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Place search failed: ${res.status}`);
  return parseGeocodeResponse(await res.json());
}
