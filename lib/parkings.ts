import { z } from "zod";
import { normalizeParking, RawResponseSchema, type Parking } from "./parkings.schema";
import { chargingByPlace, fetchGarageChargePoints, type ChargePoint } from "./chargers";
import {
  directoryFacts,
  fetchDirectory,
  matchDirectory,
  type DirectoryEntry,
} from "./directory";
import { distanceKm, type LatLng } from "./geo";
import { cached } from "./ttl-cache";
import { fetchUpstream } from "./upstream";

const ENDPOINT =
  "https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time&rows=100";

// A static catalogue of city parkings used purely to fill in addresses that
// the live feed leaves as "?". Same opendatasoft host as the live feed, so no
// extra origin to trust.
const LOCATIONS_ENDPOINT =
  "https://gent.opendatasoft.com/api/records/1.0/search/?dataset=locaties-openbare-parkings-gent&rows=100";

// The live feed changes about once a minute per garage, so 30 s keeps counts
// current while capping upstream load at two calls a minute per server
// instance, however many people are looking.
export const LIVE_TTL_MS = 30_000;
// Street addresses don't move.
const LOCATIONS_TTL_MS = 24 * 60 * 60_000;

// The server's clock at render time, handed to the client next to the data so
// "updated 3 min ago" is measured against a clock we trust rather than only
// the visitor's device.
export function serverClock(): number {
  return Date.now();
}

export type RawListResponse = z.infer<typeof RawResponseSchema>;

// A single observable API hit. We carry these alongside the parsed data so
// callers can inspect every call that was made.
export type RawApiCall = {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  ok: boolean;
  data: unknown;
};

async function fetchAndRecord(
  call: Omit<RawApiCall, "ok" | "data">,
): Promise<{ json: unknown; record: RawApiCall }> {
  try {
    const res = await fetchUpstream(call.url);
    const text = res.text;
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const errorRecord: RawApiCall = {
        ...call,
        ok: false,
        data: {
          error: `${res.status} ${res.statusText}`,
          body: parsed,
        },
      };
      throw Object.assign(new Error(`${call.title} failed: ${res.status}`), {
        record: errorRecord,
      });
    }
    return { json: parsed, record: { ...call, ok: true, data: parsed } };
  } catch (err) {
    // Preserve the recorded call so the caller can still surface it.
    if (err && typeof err === "object" && "record" in err) throw err;
    const errorRecord: RawApiCall = {
      ...call,
      ok: false,
      data: { error: err instanceof Error ? err.message : String(err) },
    };
    throw Object.assign(
      err instanceof Error ? err : new Error(String(err)),
      { record: errorRecord },
    );
  }
}

// The response is validated inside the cached loader, so a 200 with a body we
// can't use counts as a failure (retried after 5 s) instead of being reused
// as a "success" for the full 30 s.
function fetchPrimaryFeed(): Promise<{
  parsed: RawListResponse;
  record: RawApiCall;
}> {
  return cached("live-feed", { ttlMs: LIVE_TTL_MS }, async () => {
    const { json, record } = await fetchAndRecord({
      id: "bezetting-parkeergarages-real-time",
      title: "bezetting-parkeergarages-real-time",
      subtitle: "gent.opendatasoft.com — primary live feed",
      url: ENDPOINT,
    });
    return { parsed: RawResponseSchema.parse(json), record };
  });
}

const LocationsFieldsSchema = z
  .object({
    naam: z.string().optional().default(""),
    straatnaam: z.string().optional().default(""),
    huisnr: z.string().optional().default(""),
  })
  .passthrough();

const LocationsResponseSchema = z.object({
  nhits: z.number(),
  records: z.array(
    z.object({ recordid: z.string(), fields: LocationsFieldsSchema }),
  ),
});

// Strip the prefixes/articles/suffixes that differ between the live feed's
// display names and the locations dataset's names so e.g. "B-Park Dampoort"
// matches "Dampoort" and "Getouw" matches "Het Getouw".
function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^b-park\s+/, "")
    .replace(/^het\s+/, "")
    .replace(/\s+parking$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Hand-picked addresses for parkings that the locations dataset can't resolve
// unambiguously. "The Loop" in the live feed is one entry, but the static
// catalogue splits it into A0/B/C/D on different streets — pick the central
// access road shared by Loop B and Loop C.
const ADDRESS_OVERRIDES: Record<string, string> = {
  "the loop": "Louis Blériotlaan",
};

type AddressBook = { addresses: Map<string, string>; call: RawApiCall };

// Cached for a day, and if a later refresh fails we keep using the previous
// list — yesterday's street names are still right.
function fetchAddressOverrides(): Promise<AddressBook> {
  return cached(
    "locations",
    { ttlMs: LOCATIONS_TTL_MS, staleIfError: true },
    loadAddressOverrides,
  );
}

async function loadAddressOverrides(): Promise<AddressBook> {
  const { json, record } = await fetchAndRecord({
    id: "locaties-openbare-parkings-gent",
    title: "locaties-openbare-parkings-gent",
    subtitle: "gent.opendatasoft.com — static parking locations",
    url: LOCATIONS_ENDPOINT,
  });
  const parsed = LocationsResponseSchema.parse(json);
  const byKey = new Map<string, string>();
  // Track keys whose records disagree on address — drop them so we never
  // guess (e.g. "The Loop" splits into A0/B/C/D with different streets, but
  // those normalize to distinct keys anyway; this is a defensive belt).
  const conflicts = new Set<string>();
  for (const r of parsed.records) {
    const f = r.fields;
    if (!f.naam || !f.straatnaam) continue;
    const key = normalizeNameKey(f.naam);
    const addr = f.huisnr ? `${f.straatnaam} ${f.huisnr}` : f.straatnaam;
    const existing = byKey.get(key);
    if (existing && existing !== addr) conflicts.add(key);
    else byKey.set(key, addr);
  }
  for (const k of conflicts) byKey.delete(k);
  return { addresses: byKey, call: record };
}

function enrichAddress(
  parking: Parking,
  addresses: Map<string, string>,
): Parking {
  if (parking.address) return parking;
  const key = normalizeNameKey(parking.name);
  const found = ADDRESS_OVERRIDES[key] ?? addresses.get(key);
  return found ? { ...parking, address: found } : parking;
}

export type RawRecord = { recordid: string; fields: Record<string, unknown> };

// Adds what the city's other lists know about the live garages (Park & Ride,
// remarks, charge points) and returns the car parks the live feed doesn't
// cover. Pure, so the matching can be tested without a network.
export function combineSources(
  live: Parking[],
  directory: DirectoryEntry[],
  chargePoints: ChargePoint[],
): { parkings: Parking[]; extras: DirectoryEntry[] } {
  const { extras, byLiveId } = matchDirectory(directory, live);
  // A garage matched by name can have its directory pin well away from the
  // live feed's pin (the far end of the same building). Charge points near
  // either pin are that garage's.
  const directoryPins = Object.entries(byLiveId).flatMap(([id, entries]) =>
    entries.map((entry) => ({ id, lat: entry.lat, lng: entry.lng })),
  );
  const charging = chargingByPlace(chargePoints, [...live, ...extras, ...directoryPins]);
  const parkings = live.map((p) => {
    const facts = directoryFacts(byLiveId[p.id]);
    return {
      ...p,
      parkAndRide: p.parkAndRide || facts.parkAndRide,
      note: facts.note,
      evChargers: charging[p.id]?.count ?? 0,
      evMaxKw: charging[p.id]?.maxKw ?? null,
    };
  });
  return {
    parkings,
    extras: extras.map((entry) => ({
      ...entry,
      evChargers: charging[entry.id]?.count ?? 0,
      evMaxKw: charging[entry.id]?.maxKw ?? null,
    })),
  };
}

async function fetchParkingsResponse(): Promise<{
  parkings: Parking[];
  extras: DirectoryEntry[];
  parsed: RawListResponse;
  calls: RawApiCall[];
}> {
  const calls: RawApiCall[] = [];
  // All in parallel: the live feed is required; the address book, the
  // directory and the charge points are extras that must not break the page
  // when they fail.
  const [primaryResult, locationsResult, directoryResult, chargersResult] =
    await Promise.allSettled([
      fetchPrimaryFeed(),
      fetchAddressOverrides(),
      fetchDirectory(),
      fetchGarageChargePoints(),
    ]);

  if (primaryResult.status === "rejected") {
    throw primaryResult.reason;
  }
  const { parsed, record } = primaryResult.value;
  calls.push(record);
  let parkings = parsed.records.map(normalizeParking);

  if (locationsResult.status === "fulfilled") {
    calls.push(locationsResult.value.call);
    const { addresses } = locationsResult.value;
    parkings = parkings.map((p) => enrichAddress(p, addresses));
  } else {
    const e = locationsResult.reason as Error & { record?: RawApiCall };
    if (e.record) calls.push(e.record);
    /* swallow — address enrichment is best-effort */
  }

  const combined = combineSources(
    parkings,
    directoryResult.status === "fulfilled" ? directoryResult.value : [],
    chargersResult.status === "fulfilled" ? chargersResult.value : [],
  );
  parkings = combined.parkings;

  // Stable name sort by default so the order is deterministic across refreshes.
  parkings.sort((a, b) => a.name.localeCompare(b.name));
  const extras = combined.extras.sort((a, b) => a.name.localeCompare(b.name));
  return { parkings, extras, parsed, calls };
}

export async function fetchParkings(): Promise<Parking[]> {
  const { parkings } = await fetchParkingsResponse();
  return parkings;
}

// The live garages plus the car parks without a live count (Park & Ride and
// privately run garages).
export async function fetchAllParkings(): Promise<{
  parkings: Parking[];
  extras: DirectoryEntry[];
}> {
  const { parkings, extras } = await fetchParkingsResponse();
  return { parkings, extras };
}

// A car park without live counts, by its id ("pr-watersportbaan"). Works
// even when the live feed is down: the directory is all it needs.
export async function fetchExtraParkingById(id: string): Promise<DirectoryEntry | null> {
  const [liveResult, directory, chargePoints] = await Promise.all([
    fetchParkings().catch(() => [] as Parking[]),
    fetchDirectory().catch(() => [] as DirectoryEntry[]),
    fetchGarageChargePoints().catch(() => [] as ChargePoint[]),
  ]);
  const { extras } = combineSources(liveResult, directory, chargePoints);
  return extras.find((entry) => entry.id === id) ?? null;
}

export async function fetchParkingsWithRaw(): Promise<{
  parkings: Parking[];
  raw: RawListResponse;
  calls: RawApiCall[];
}> {
  const { parkings, parsed, calls } = await fetchParkingsResponse();
  return { parkings, raw: parsed, calls };
}

export async function fetchParkingById(id: string): Promise<Parking | null> {
  const all = await fetchParkings();
  return all.find((p) => p.id === id) ?? null;
}

export async function fetchParkingDetailById(id: string): Promise<
  | {
      parking: Parking;
      raw: RawRecord;
      calls: RawApiCall[];
    }
  | null
> {
  const { parkings, parsed, calls } = await fetchParkingsResponse();
  const parking = parkings.find((p) => p.id === id);
  if (!parking) return null;
  const raw = parsed.records.find((r) => normalizeParking(r).id === id);
  return { parking, raw: raw as RawRecord, calls };
}

export type SortKey =
  | "spaces-desc"
  | "distance"
  | "percent-desc"
  | "name-asc"
  | "name-desc"
  | "spaces-asc"
  | "percent-asc";

export const SORT_KEYS: readonly SortKey[] = [
  "spaces-desc",
  "distance",
  "percent-desc",
  "name-asc",
  "name-desc",
  "spaces-asc",
  "percent-asc",
] as const;

export const DEFAULT_SORT: SortKey = "spaces-desc";

// Can you actually drive there and park right now (as far as we know)?
export function isUsable(p: Parking): boolean {
  return p.isOpen && p.hasLiveData && p.bucket !== "full";
}

export function distanceTo(p: Parking, origin: LatLng | null): number | null {
  if (!origin || p.lat === null || p.lng === null) return null;
  return distanceKm(origin, { lat: p.lat, lng: p.lng });
}

// Availability-style sorts push closed / no-data parkings to the end: when
// you're looking for a spot, "0 free (closed)" is noise, not a result. Name
// sorts are plain alphabetical. "distance" without a location falls back to
// most free spaces.
export function sortParkings(
  list: Parking[],
  key: SortKey,
  origin: LatLng | null = null,
): Parking[] {
  const sorted = [...list];
  const usableFirst = (a: Parking, b: Parking) =>
    Number(b.isOpen && b.hasLiveData) - Number(a.isOpen && a.hasLiveData);
  switch (key) {
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "spaces-asc":
      return sorted.sort((a, b) => usableFirst(a, b) || a.freeSpaces - b.freeSpaces);
    case "spaces-desc":
      return sorted.sort((a, b) => usableFirst(a, b) || b.freeSpaces - a.freeSpaces);
    case "percent-asc":
      return sorted.sort((a, b) => usableFirst(a, b) || a.freePercent - b.freePercent);
    case "percent-desc":
      return sorted.sort((a, b) => usableFirst(a, b) || b.freePercent - a.freePercent);
    case "distance": {
      if (!origin) return sortParkings(list, "spaces-desc");
      // Unusable parkings go last even if they're next door.
      return sorted.sort((a, b) => {
        const u = Number(isUsable(b)) - Number(isUsable(a));
        if (u) return u;
        return (distanceTo(a, origin) ?? Infinity) - (distanceTo(b, origin) ?? Infinity);
      });
    }
  }
}

export type Filters = {
  q: string;
  status: string[]; // "open" | "closed"
  lez: string[]; // "inside" | "outside"
  type: string[]; // raw type values, e.g. "carPark"
  bucket: string[]; // "available" | "almost-full" | "full"
  // Quick toggle: only parkings that are open with live space right now.
  onlyAvailable?: boolean;
  // Must have all of these: "ev" | "free" | "pr".
  features?: string[];
};

export const FEATURE_KEYS = ["ev", "free", "pr"] as const;

type Facilities = { evChargers: number; isFree: boolean | null; parkAndRide: boolean };

function hasFeatures(place: Facilities, features: string[] | undefined): boolean {
  for (const feature of features ?? []) {
    if (feature === "ev" && place.evChargers === 0) return false;
    // "Unknown" is not "free".
    if (feature === "free" && place.isFree !== true) return false;
    if (feature === "pr" && !place.parkAndRide) return false;
  }
  return true;
}

function matchesQuery(place: { name: string; address: string }, q: string): boolean {
  return !q || place.name.toLowerCase().includes(q) || place.address.toLowerCase().includes(q);
}

// The car parks without a live count that fit the search. A filter on
// something only the live feed knows (open, has space, LEZ, type) hides them
// all: we can't tell whether they match.
export function filterExtras(list: DirectoryEntry[], filters: Filters): DirectoryEntry[] {
  if (
    filters.onlyAvailable ||
    filters.status.length > 0 ||
    filters.lez.length > 0 ||
    filters.type.length > 0 ||
    filters.bucket.length > 0
  ) {
    return [];
  }
  const q = filters.q.trim().toLowerCase();
  return list.filter((entry) => matchesQuery(entry, q) && hasFeatures(entry, filters.features));
}

// Nearest first when there is a point to measure from; otherwise Park & Ride
// first, then by name.
export function sortExtras(list: DirectoryEntry[], origin: LatLng | null): DirectoryEntry[] {
  const sorted = [...list];
  if (origin) {
    sorted.sort((a, b) => distanceKm(origin, a) - distanceKm(origin, b));
  } else {
    sorted.sort(
      (a, b) =>
        Number(b.parkAndRide) - Number(a.parkAndRide) || a.name.localeCompare(b.name),
    );
  }
  return sorted;
}

export function filterParkings(list: Parking[], filters: Filters): Parking[] {
  const q = filters.q.trim().toLowerCase();
  return list.filter((p) => {
    if (filters.onlyAvailable && !isUsable(p)) return false;
    if (!matchesQuery(p, q)) return false;
    if (!hasFeatures(p, filters.features)) return false;
    if (filters.status.length > 0) {
      const status = p.isOpen ? "open" : "closed";
      if (!filters.status.includes(status)) return false;
    }
    if (filters.lez.length > 0) {
      const lez = p.isInsideLez ? "inside" : "outside";
      if (!filters.lez.includes(lez)) return false;
    }
    if (filters.type.length > 0 && !filters.type.includes(p.type)) return false;
    if (filters.bucket.length > 0 && !filters.bucket.includes(p.bucket)) return false;
    return true;
  });
}

export function uniqueTypes(list: Parking[]): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const p of list) {
    if (p.type && !map.has(p.type)) map.set(p.type, p.typeLabel);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label }));
}
