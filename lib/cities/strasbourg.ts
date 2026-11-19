import { z } from "zod";
import { bucketFor, type Parking } from "../parkings.schema";
import { cached } from "../ttl-cache";
import { fetchUpstream } from "../upstream";
import { wallClockToEpoch } from "../zoned-time";

// Strasbourg's car parks, from the Eurométropole's open data portal (the same
// platform Ghent uses). Two lists, joined on `idsurfs`:
//
//  - occupation-parkings-temps-reel: free spaces per car park, refreshed
//    every few minutes;
//  - parkings: where each one is, its address and phone number.
const BASE = "https://data.strasbourg.eu/api/explore/v2.1/catalog/datasets";
const OCCUPANCY_URL = `${BASE}/occupation-parkings-temps-reel/records?limit=100`;
const LOCATIONS_URL = `${BASE}/parkings/records?limit=100&select=idsurfs,name,address,phone,position,friendlyurl,normalizedalias`;

const LIVE_TTL_MS = 30_000;
const LOCATIONS_TTL_MS = 24 * 60 * 60_000;
const TIME_ZONE = "Europe/Paris";

const OccupancySchema = z.object({
  nom_parking: z.string(),
  idsurfs: z.string().nullish(),
  ident: z.union([z.number(), z.string()]).nullish(),
  // 1 open, 2 closed, 0 "live count unavailable".
  etat: z.coerce.number(),
  total: z.coerce.number(),
  libre: z.coerce.number(),
  ts: z.string().nullish(),
});

const LocationSchema = z.object({
  idsurfs: z.string(),
  name: z.string().nullish(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  position: z.object({ lat: z.number(), lon: z.number() }).nullish(),
  friendlyurl: z.string().nullish(),
  normalizedalias: z.string().nullish(),
});

export type Occupancy = z.infer<typeof OccupancySchema>;
export type Location = z.infer<typeof LocationSchema>;

const ListSchema = z.object({ results: z.array(z.unknown()) });

// Rows that can't be read are skipped: one odd record must not take the whole
// city down.
function rows<T>(json: unknown, schema: z.ZodType<T>): T[] {
  const out: T[] = [];
  for (const raw of ListSchema.parse(json).results) {
    const parsed = schema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const parseOccupancy = (json: unknown) => rows(json, OccupancySchema);
export const parseLocations = (json: unknown) => rows(json, LocationSchema);

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// "4 Rue Catherine Kany 67000 Strasbourg France" → without the country.
const tidyAddress = (address: string) => address.replace(/\s+France\s*$/i, "").trim();

export function toParkings(occupancy: Occupancy[], locations: Location[]): Parking[] {
  const byId = new Map(locations.map((location) => [location.idsurfs, location]));
  return occupancy.map((row): Parking => {
    const place = row.idsurfs ? byId.get(row.idsurfs) : undefined;
    const isOpen = row.etat !== 2;
    // State 0 is the feed's own way of saying it has no count right now.
    const hasLiveData = row.etat !== 0 && row.total > 0;
    const total = Math.max(0, row.total);
    const free = Math.min(total, Math.max(0, row.libre));
    const freePercent = total > 0 ? (free / total) * 100 : 0;
    const id = place?.normalizedalias || slug(row.nom_parking) || `strasbourg-${row.ident ?? "x"}`;
    return {
      id,
      name: row.nom_parking,
      description: "",
      openingHours: "",
      websiteUrl: place?.friendlyurl ?? "",
      operator: "",
      type: "",
      typeLabel: "",
      category: "",
      categoryLabel: "",
      // Not in the data: see `knows` in lib/cities/info.ts.
      isInsideLez: false,
      isOpen,
      isTemporaryClosed: false,
      totalSpaces: total,
      freeSpaces: hasLiveData ? free : 0,
      occupiedPercent: hasLiveData ? 100 - freePercent : 0,
      freePercent: hasLiveData ? freePercent : 0,
      hasLiveData,
      bucket: hasLiveData ? bucketFor(isOpen, freePercent) : "closed",
      address: place?.address ? tidyAddress(place.address) : "",
      lat: place?.position?.lat ?? null,
      lng: place?.position?.lon ?? null,
      phone: place?.phone || null,
      // The feed labels its local time as UTC; read the clock digits as the
      // time in Strasbourg.
      lastUpdatedAt: row.ts ? wallClockToEpoch(row.ts, TIME_ZONE) : null,
      isFree: false,
      parkAndRide: false,
      evChargers: 0,
      evMaxKw: null,
      note: null,
    };
  });
}

async function fetchJson(url: string, what: string): Promise<unknown> {
  const res = await fetchUpstream(url);
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${res.statusText}`);
  return JSON.parse(res.text);
}

// Addresses and positions change rarely; a failing list is retried once a
// minute and the last good one is used meanwhile.
const fetchLocations = () =>
  cached(
    "strasbourg-locations",
    { ttlMs: LOCATIONS_TTL_MS, errorTtlMs: 60_000, staleIfError: true },
    async () => parseLocations(await fetchJson(LOCATIONS_URL, "Strasbourg car park list")),
  );

export function fetchStrasbourgParkings(): Promise<Parking[]> {
  return cached("strasbourg-live", { ttlMs: LIVE_TTL_MS }, async () => {
    const [occupancy, locations] = await Promise.all([
      fetchJson(OCCUPANCY_URL, "Strasbourg occupancy").then(parseOccupancy),
      // Without the locations there are still counts; only distances are lost.
      fetchLocations().catch(() => [] as Location[]),
    ]);
    if (occupancy.length === 0) throw new Error("The Strasbourg feed returned no car parks");
    return toParkings(occupancy, locations).sort((a, b) => a.name.localeCompare(b.name));
  });
}
