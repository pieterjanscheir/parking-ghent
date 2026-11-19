import { z } from "zod";
import { normalizeParking, RawResponseSchema, type Parking } from "./parkings.schema";
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
    const text = await res.text();
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

function fetchPrimaryFeed(): Promise<{ json: unknown; record: RawApiCall }> {
  return cached("live-feed", { ttlMs: LIVE_TTL_MS }, () =>
    fetchAndRecord({
      id: "bezetting-parkeergarages-real-time",
      title: "bezetting-parkeergarages-real-time",
      subtitle: "gent.opendatasoft.com — primary live feed",
      url: ENDPOINT,
    }),
  );
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

async function fetchParkingsResponse(): Promise<{
  parkings: Parking[];
  parsed: RawListResponse;
  calls: RawApiCall[];
}> {
  const calls: RawApiCall[] = [];
  // Both feeds in parallel: live (required) and locations (static address
  // book, optional — it must not break the page if it fails).
  const [primaryResult, locationsResult] = await Promise.allSettled([
    fetchPrimaryFeed(),
    fetchAddressOverrides(),
  ]);

  if (primaryResult.status === "rejected") {
    throw primaryResult.reason;
  }
  const { json, record } = primaryResult.value;
  calls.push(record);
  const parsed = RawResponseSchema.parse(json);
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

  // Stable name sort by default so the order is deterministic across refreshes.
  parkings.sort((a, b) => a.name.localeCompare(b.name));
  return { parkings, parsed, calls };
}

export async function fetchParkings(): Promise<Parking[]> {
  const { parkings } = await fetchParkingsResponse();
  return parkings;
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

export const SORT_LABELS: Record<SortKey, string> = {
  "spaces-desc": "Most free spaces",
  distance: "Nearest to me",
  "percent-desc": "Emptiest (% free)",
  "name-asc": "Name (A → Z)",
  "name-desc": "Name (Z → A)",
  "spaces-asc": "Fewest free spaces",
  "percent-asc": "Fullest (% free)",
};

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
};

export function filterParkings(list: Parking[], filters: Filters): Parking[] {
  const q = filters.q.trim().toLowerCase();
  return list.filter((p) => {
    if (filters.onlyAvailable && !isUsable(p)) return false;
    if (
      q &&
      !p.name.toLowerCase().includes(q) &&
      !p.address.toLowerCase().includes(q)
    ) {
      return false;
    }
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
