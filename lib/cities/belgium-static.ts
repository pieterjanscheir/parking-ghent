import { z } from "zod";
import type { DirectoryEntry } from "../directory";
import { cached } from "../ttl-cache";
import { fetchUpstream } from "../upstream";

// Belgian cities that publish where their car parks are and how big, but not
// how full: Antwerp, Brussels, Liège and Namur. They become "car parks
// without a live count", the same shape Ghent's Park & Ride lots have.
//
// Each city has a `parse…` function that turns its own format into that
// shape (tested with real sample records) and a cached loader. Rows that
// can't be read are skipped: one odd record must not take a city down.

// These lists change a few times a year.
const TTL_MS = 24 * 60 * 60_000;

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

const httpUrl = (value: string | null | undefined): string | null => {
  try {
    const url = new URL(clean(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const wholeNumber = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

type Draft = {
  name: string;
  lat: number;
  lng: number;
  capacity: number | null;
  address: string;
  url: string | null;
  parkAndRide: boolean;
  isFree: boolean | null;
  evChargers: number;
};

// Ids are the name as a slug; two car parks with the same name get a number.
function toEntries(drafts: Draft[]): DirectoryEntry[] {
  const seen = new Map<string, number>();
  const entries: DirectoryEntry[] = [];
  for (const draft of drafts) {
    const name = clean(draft.name);
    if (!name || !Number.isFinite(draft.lat) || !Number.isFinite(draft.lng)) continue;
    const base = slug(name) || "car-park";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    entries.push({
      id: count === 1 ? base : `${base}-${count}`,
      name,
      lat: draft.lat,
      lng: draft.lng,
      parkAndRide: draft.parkAndRide,
      capacity: draft.capacity,
      address: clean(draft.address),
      url: draft.url,
      note: null,
      isFree: draft.isFree,
      evChargers: draft.evChargers,
      evMaxKw: null,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function each<T>(list: unknown, schema: z.ZodType<T>): T[] {
  const out: T[] = [];
  for (const raw of z.array(z.unknown()).parse(list)) {
    const parsed = schema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// --- Antwerp ---------------------------------------------------------------
// The city's map server: one layer with the public car parks ("rotatie-
// parkings"), one with the Park & Ride sites. Asked for in WGS84.

const ANTWERP = "https://geodata.antwerpen.be/arcgissql/rest/services/P_Portal/portal_publiek5/MapServer";
const ARCGIS_QUERY = "query?where=1%3D1&outFields=*&outSR=4326&f=json";
const ANTWERP_CAR_PARKS_URL = `${ANTWERP}/578/${ARCGIS_QUERY}`;
const ANTWERP_PARK_AND_RIDE_URL = `${ANTWERP}/566/${ARCGIS_QUERY}`;

const Point = z.object({ x: z.number(), y: z.number() });
const Features = z.object({ features: z.array(z.unknown()) });

const AntwerpCarPark = z.object({
  attributes: z.object({
    NAAM: z.string(),
    STRAATNAAM: z.string().nullish(),
    HUISNUMMER: z.string().nullish(),
    PLAATSEN: z.number().nullish(),
    ELEKTRISCHE_PLAATSEN: z.union([z.string(), z.number()]).nullish(),
    GEBRUIK: z.string().nullish(),
    LINK: z.string().nullish(),
  }),
  geometry: Point,
});

const AntwerpParkAndRide = z.object({
  attributes: z.object({
    Naam: z.string(),
    STRAAT: z.string().nullish(),
    HUISNR: z.union([z.string(), z.number()]).nullish(),
    Plaatsen: z.number().nullish(),
    AANTAL_EL_LAADPALEN: z.union([z.string(), z.number()]).nullish(),
    GEBRUIK: z.string().nullish(),
    LINK: z.string().nullish(),
    PRIJS: z.string().nullish(),
  }),
  geometry: Point,
});

// "bestaand" = in use; planned or closed sites are left out.
const inUse = (value: string | null | undefined) => clean(value).toLowerCase() === "bestaand";

export function parseAntwerp(carParks: unknown, parkAndRide: unknown): DirectoryEntry[] {
  const drafts: Draft[] = [];
  for (const { attributes: a, geometry } of each(Features.parse(carParks).features, AntwerpCarPark)) {
    if (!inUse(a.GEBRUIK)) continue;
    drafts.push({
      name: a.NAAM,
      lat: geometry.y,
      lng: geometry.x,
      capacity: wholeNumber(a.PLAATSEN),
      address: `${clean(a.STRAATNAAM)} ${clean(a.HUISNUMMER)}`,
      url: httpUrl(a.LINK),
      parkAndRide: false,
      // The price is given as text ("€ 3,10" per hour), not as free or paid.
      isFree: null,
      evChargers: wholeNumber(a.ELEKTRISCHE_PLAATSEN) ?? 0,
    });
  }
  for (const { attributes: a, geometry } of each(Features.parse(parkAndRide).features, AntwerpParkAndRide)) {
    if (!inUse(a.GEBRUIK)) continue;
    const price = clean(a.PRIJS).toLowerCase();
    drafts.push({
      name: a.Naam,
      lat: geometry.y,
      lng: geometry.x,
      capacity: wholeNumber(a.Plaatsen),
      address: `${clean(a.STRAAT)} ${clean(String(a.HUISNR ?? ""))}`,
      url: httpUrl(a.LINK),
      parkAndRide: true,
      // "Gratis" exactly; "Gratis voor abonnees" and "Gratis <12uur" are not.
      isFree: price === "" ? null : price === "gratis",
      evChargers: wholeNumber(a.AANTAL_EL_LAADPALEN) ?? 0,
    });
  }
  return toEntries(drafts);
}

// --- Brussels --------------------------------------------------------------
// parking.brussels, the regional parking agency: public car parks and the
// region's Park & Ride sites, as GeoJSON.

const BRUSSELS =
  "https://ows.parking.brussels/ws/ParkingBrussels/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326";
const BRUSSELS_CAR_PARKS_URL = `${BRUSSELS}&typeNames=public_parking`;
const BRUSSELS_PARK_AND_RIDE_URL = `${BRUSSELS}&typeNames=park_and_ride`;

// Points arrive as a list with one [lng, lat] in it.
const MultiPoint = z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])).min(1) });

const BrusselsCarPark = z.object({
  geometry: MultiPoint,
  properties: z.object({
    name_fr: z.string().nullish(),
    name_du: z.string().nullish(),
    addr_fr: z.string().nullish(),
    capacity_car: z.number().nullish(),
    url: z.string().nullish(),
  }),
});

const BrusselsParkAndRide = z.object({
  geometry: MultiPoint,
  properties: z.object({
    name_fr: z.string().nullish(),
    name_du: z.string().nullish(),
    street_fr: z.string().nullish(),
    housenr: z.union([z.string(), z.number()]).nullish(),
    capacity_car: z.number().nullish(),
    url: z.string().nullish(),
  }),
});

export function parseBrussels(carParks: unknown, parkAndRide: unknown): DirectoryEntry[] {
  const drafts: Draft[] = [];
  for (const { geometry, properties: p } of each(Features.parse(carParks).features, BrusselsCarPark)) {
    const [lng, lat] = geometry.coordinates[0];
    drafts.push({
      name: clean(p.name_fr) || clean(p.name_du),
      lat,
      lng,
      capacity: wholeNumber(p.capacity_car),
      address: clean(p.addr_fr),
      url: httpUrl(p.url),
      parkAndRide: false,
      isFree: null,
      evChargers: 0,
    });
  }
  for (const { geometry, properties: p } of each(Features.parse(parkAndRide).features, BrusselsParkAndRide)) {
    const [lng, lat] = geometry.coordinates[0];
    const name = clean(p.name_fr) || clean(p.name_du);
    drafts.push({
      // "Heysel" alone doesn't say what it is.
      name: name && !/p\s*\+\s*r/i.test(name) ? `P+R ${name}` : name,
      lat,
      lng,
      capacity: wholeNumber(p.capacity_car),
      address: `${clean(p.street_fr)} ${clean(String(p.housenr ?? ""))}`,
      url: httpUrl(p.url),
      parkAndRide: true,
      isFree: null,
      evChargers: 0,
    });
  }
  return toEntries(drafts);
}

// --- Liège and Namur -------------------------------------------------------
// Both on Opendatasoft, the platform Ghent uses; the whole list in one call.

const LIEGE = "https://opendata.liege.be/api/explore/v2.1/catalog/datasets";
const LIEGE_CAR_PARKS_URL = `${LIEGE}/parkings-voitures-hors-voirie/exports/json`;
const LIEGE_PARK_AND_RIDE_URL = `${LIEGE}/parking-relais-p-r/exports/json`;
const NAMUR_URL =
  "https://data.namur.be/api/explore/v2.1/catalog/datasets/namur-mobilite-parking/exports/json";

const GeoPoint = z.object({ lon: z.number(), lat: z.number() });

const LiegeCarPark = z.object({
  title: z.string(),
  street_name: z.string().nullish(),
  house_number: z.union([z.string(), z.number()]).nullish(),
  // The capacity, despite its name: the list is updated by hand.
  available_spaces: z.number().nullish(),
  website: z.string().nullish(),
  charging_stations: z.union([z.string(), z.number()]).nullish(),
  geo_point_2d: GeoPoint,
});

const LiegeParkAndRide = z.object({
  name: z.string(),
  status: z.string().nullish(),
  street_name: z.string().nullish(),
  house_number: z.union([z.string(), z.number()]).nullish(),
  available_spaces: z.number().nullish(),
  geo_point_2d: GeoPoint,
});

export function parseLiege(carParks: unknown, parkAndRide: unknown): DirectoryEntry[] {
  const drafts: Draft[] = [];
  for (const row of each(carParks, LiegeCarPark)) {
    drafts.push({
      name: row.title,
      lat: row.geo_point_2d.lat,
      lng: row.geo_point_2d.lon,
      capacity: wholeNumber(row.available_spaces),
      address: `${clean(row.street_name)} ${clean(String(row.house_number ?? ""))}`,
      url: httpUrl(row.website),
      parkAndRide: false,
      isFree: null,
      evChargers: wholeNumber(row.charging_stations) ?? 0,
    });
  }
  for (const row of each(parkAndRide, LiegeParkAndRide)) {
    // The list also holds sites that are only planned ("En projet").
    if (clean(row.status).toLowerCase() !== "existant") continue;
    drafts.push({
      name: row.name,
      lat: row.geo_point_2d.lat,
      lng: row.geo_point_2d.lon,
      capacity: wholeNumber(row.available_spaces),
      address: `${clean(row.street_name)} ${clean(String(row.house_number ?? ""))}`,
      url: null,
      parkAndRide: true,
      isFree: null,
      evChargers: 0,
    });
  }
  return toEntries(drafts);
}

const NamurCarPark = z.object({
  plsy_descri: z.string(),
  // "Parking", "Parking couvert", "Parking Malin" (park and walk or bus in)
  // or "Parking Relais" (Park & Ride).
  plsy_fonction: z.string().nullish(),
  places: z.union([z.string(), z.number()]).nullish(),
  rue_nom: z.string().nullish(),
  adr_nopol: z.union([z.string(), z.number()]).nullish(),
  geo_point_2d: GeoPoint,
});

export function parseNamur(carParks: unknown): DirectoryEntry[] {
  return toEntries(
    each(carParks, NamurCarPark).map((row) => ({
      name: row.plsy_descri,
      lat: row.geo_point_2d.lat,
      lng: row.geo_point_2d.lon,
      capacity: wholeNumber(row.places),
      address: `${clean(row.rue_nom)} ${clean(String(row.adr_nopol ?? ""))}`,
      url: null,
      parkAndRide: clean(row.plsy_fonction).toLowerCase() === "parking relais",
      isFree: null,
      evChargers: 0,
    })),
  );
}

// --- Loaders ---------------------------------------------------------------

async function fetchJson(url: string, what: string): Promise<unknown> {
  const res = await fetchUpstream(url);
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${res.statusText}`);
  return JSON.parse(res.text);
}

// A failing list is tried again after a minute and the last good one is used
// meanwhile. A list with nothing usable in it counts as failing too: it must
// not replace a good one for a day.
function staticCity(
  key: string,
  what: string,
  urls: string[],
  parse: (...lists: unknown[]) => DirectoryEntry[],
): () => Promise<DirectoryEntry[]> {
  return () =>
    cached(key, { ttlMs: TTL_MS, errorTtlMs: 60_000, staleIfError: true }, async () => {
      const lists = await Promise.all(urls.map((url) => fetchJson(url, what)));
      const entries = parse(...lists);
      if (entries.length === 0) throw new Error(`${what} is empty`);
      return entries;
    });
}

export const fetchAntwerpCarParks = staticCity(
  "antwerp-car-parks",
  "Antwerp's car park list",
  [ANTWERP_CAR_PARKS_URL, ANTWERP_PARK_AND_RIDE_URL],
  parseAntwerp,
);

export const fetchBrusselsCarParks = staticCity(
  "brussels-car-parks",
  "Brussels' car park list",
  [BRUSSELS_CAR_PARKS_URL, BRUSSELS_PARK_AND_RIDE_URL],
  parseBrussels,
);

export const fetchLiegeCarParks = staticCity(
  "liege-car-parks",
  "Liège's car park list",
  [LIEGE_CAR_PARKS_URL, LIEGE_PARK_AND_RIDE_URL],
  parseLiege,
);

export const fetchNamurCarParks = staticCity("namur-car-parks", "Namur's car park list", [NAMUR_URL], parseNamur);
