import { z } from "zod";
import { normalizeParking, RawResponseSchema, type Parking } from "./parkings.schema";

const ENDPOINT =
  "https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time&rows=100";

// Secondary feed. Less reliable than the primary, but it's the only public
// source that includes the two Interparking garages (Kouter and Zuid). We
// pull *only* those two from it — everything else is delegated to the primary
// dataset above.
const MOBI_ENDPOINT =
  "https://data.stad.gent/api/records/1.0/search/?dataset=mobi-parkings&q=(parkingtype:Parking+OR+parkingtype:P%2BR)&sort=-availablecapacity&rows=100&lang=nl&apikey=5e015407b7e6f1e916f294d145a90be13c288ee4a8fc565001b805a4";

// id_parking → desired ({ id, name }) for the parkings we adopt from the
// secondary feed. Acts as both an allow-list and a name-normalisation table.
const MOBI_FALLBACK: Record<string, { id: string; name: string }> = {
  "P Kouter": { id: "parking-kouter", name: "Kouter" },
  "P Zuid": { id: "parking-zuid", name: "Zuid" },
  "P Center": { id: "parking-center", name: "Center" },
};

export const PRIMARY_DATASET = "bezetting-parkeergarages-real-time";
export const MOBI_DATASET = "mobi-parkings";

export type ParkingSource = typeof PRIMARY_DATASET | typeof MOBI_DATASET;

export type RawListResponse = z.infer<typeof RawResponseSchema>;

// A single observable API hit. We carry these alongside the parsed data so
// the page can render every call it made as a formatted JSON block.
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
    const res = await fetch(call.url, { cache: "no-store" });
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
    // Preserve the recorded call so the caller can still surface it in the UI.
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

const MobiFieldsSchema = z
  .object({
    id_parking: z.string(),
    parkingdatalink: z.string().optional().default(""),
    description: z.string().optional().default(""),
    urllinkaddress: z.string().optional().default(""),
    openingtimesdescription: z.string().optional().default(""),
    fotourl: z.string().optional().default(""),
    totalcapacity: z.number().optional().default(0),
    availablecapacity: z.number().optional().default(0),
    isopennow: z.number().optional().default(0),
    temporaryclosed: z.number().optional().default(0),
    binnenlez: z.boolean().optional().default(false),
    type: z.string().optional().default(""),
    locationanddimension: z.string().optional().default(""),
    lastupdate: z.string().optional().default(""),
  })
  .passthrough();

const MobiRecordSchema = z.object({
  recordid: z.string(),
  fields: MobiFieldsSchema,
});

const MobiResponseSchema = z.object({
  nhits: z.number(),
  records: z.array(MobiRecordSchema),
});

type MobiRecord = z.infer<typeof MobiRecordSchema>;

function mobiToParking(record: MobiRecord): Parking | null {
  const override = MOBI_FALLBACK[record.fields.id_parking];
  if (!override) return null;
  const f = record.fields;
  // Guard against the dataset's "data unavailable" sentinels: -1 free spaces
  // and 0 capacity both show up periodically. Drop those rather than feed the
  // UI nonsense percentages.
  if (f.totalcapacity <= 0) return null;
  if (f.availablecapacity < 0) return null;

  // The secondary feed has no `operatorinformation`, but `parkingdatalink`
  // ("Interparking Kouter") encodes it. Strip the parking name to leave the
  // operator. Safe default: "Interparking" (both fallback parkings are theirs).
  const operator =
    f.parkingdatalink.replace(/\s+\S+\s*$/, "").trim() || "Interparking";

  const synthetic = {
    recordid: record.recordid,
    fields: {
      name: override.name,
      description: f.description,
      openingtimesdescription: f.openingtimesdescription,
      urllinkaddress: f.urllinkaddress,
      fotourl: f.fotourl,
      freeparking: 0,
      occupation: 0,
      availablecapacity: f.availablecapacity,
      totalcapacity: f.totalcapacity,
      temporaryclosed: f.temporaryclosed,
      isopennow: f.isopennow,
      // Map binnenlez → the `categorie` strings the primary feed uses so the
      // existing isInsideLez / categoryLabel branches in normalizeParking
      // don't need to know about the secondary source.
      categorie: f.binnenlez ? "binnen LEZ" : "buiten LEZ",
      type: f.type,
      operatorinformation: operator,
      occupancytrend: "unknown",
      lastupdate: f.lastupdate,
      id: "",
      locationanddimension: f.locationanddimension,
    },
  };

  // Force a stable, predictable id rather than letting stableIdFromUrl derive
  // it from the Interparking URL (which yields inconsistent slugs like
  // "Gent-Zuid"). Keeps favorites and URLs deterministic.
  return { ...normalizeParking(synthetic), id: override.id };
}

async function fetchMobiFallbackParkings(): Promise<{
  parkings: Parking[];
  rawById: Record<string, MobiRecord>;
  call: RawApiCall;
}> {
  const { json, record } = await fetchAndRecord({
    id: "mobi-parkings",
    title: "mobi-parkings (fallback feed)",
    subtitle: "data.stad.gent — mobi-parkings",
    url: MOBI_ENDPOINT,
  });
  const parsed = MobiResponseSchema.parse(json);
  const parkings: Parking[] = [];
  const rawById: Record<string, MobiRecord> = {};
  for (const r of parsed.records) {
    if (!(r.fields.id_parking in MOBI_FALLBACK)) continue;
    const parking = mobiToParking(r);
    if (!parking) continue;
    parkings.push(parking);
    rawById[parking.id] = r;
  }
  return { parkings, rawById, call: record };
}

async function fetchParkingsResponse(): Promise<{
  parkings: Parking[];
  parsed: RawListResponse;
  calls: RawApiCall[];
}> {
  // Live data — never cache. Auto-refresh on the client triggers
  // router.refresh() which re-runs this fetch on the server.
  const calls: RawApiCall[] = [];
  const { json, record } = await fetchAndRecord({
    id: "bezetting-parkeergarages-real-time",
    title: "bezetting-parkeergarages-real-time",
    subtitle: "gent.opendatasoft.com — primary live feed",
    url: ENDPOINT,
  }).catch((err: Error & { record?: RawApiCall }) => {
    if (err.record) calls.push(err.record);
    throw err;
  });
  calls.push(record);
  const parsed = RawResponseSchema.parse(json);
  const parkings = parsed.records.map(normalizeParking);

  // Best-effort append of the two Interparking garages from the secondary
  // feed. Primary always wins on overlap (by id), and a failure here must not
  // break the page — the secondary feed has occasional outages.
  try {
    const { parkings: fallback, call } = await fetchMobiFallbackParkings();
    calls.push(call);
    const knownIds = new Set(parkings.map((p) => p.id));
    for (const extra of fallback) {
      if (!knownIds.has(extra.id)) parkings.push(extra);
    }
  } catch (err) {
    const e = err as Error & { record?: RawApiCall };
    if (e.record) calls.push(e.record);
    /* swallow — secondary feed is unreliable by design */
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

export type RawRecord = { recordid: string; fields: Record<string, unknown> };

export async function fetchParkingDetailById(id: string): Promise<
  | {
      parking: Parking;
      raw: RawRecord;
      source: ParkingSource;
      calls: RawApiCall[];
    }
  | null
> {
  const calls: RawApiCall[] = [];
  let primary: RawListResponse;
  try {
    const { json, record } = await fetchAndRecord({
      id: "bezetting-parkeergarages-real-time",
      title: "bezetting-parkeergarages-real-time",
      subtitle: "gent.opendatasoft.com — primary live feed",
      url: ENDPOINT,
    });
    calls.push(record);
    primary = RawResponseSchema.parse(json);
  } catch (err) {
    const e = err as Error & { record?: RawApiCall };
    if (e.record) calls.push(e.record);
    throw err;
  }

  for (const record of primary.records) {
    const parking = normalizeParking(record);
    if (parking.id === id) {
      return {
        parking,
        raw: record as RawRecord,
        source: PRIMARY_DATASET,
        calls,
      };
    }
  }

  // Not in the primary feed — try the secondary fallback (Kouter/Zuid).
  try {
    const { parkings, rawById, call } = await fetchMobiFallbackParkings();
    calls.push(call);
    const parking = parkings.find((p) => p.id === id);
    if (parking) {
      return {
        parking,
        raw: rawById[id] as RawRecord,
        source: MOBI_DATASET,
        calls,
      };
    }
  } catch (err) {
    const e = err as Error & { record?: RawApiCall };
    if (e.record) calls.push(e.record);
    /* fall through to 404 */
  }
  return null;
}

export type SortKey =
  | "name-asc"
  | "name-desc"
  | "spaces-asc"
  | "spaces-desc"
  | "percent-asc"
  | "percent-desc";

export const SORT_KEYS: readonly SortKey[] = [
  "name-asc",
  "name-desc",
  "spaces-asc",
  "spaces-desc",
  "percent-asc",
  "percent-desc",
] as const;

export const SORT_LABELS: Record<SortKey, string> = {
  "name-asc": "Name (A → Z)",
  "name-desc": "Name (Z → A)",
  "spaces-asc": "Free spaces (low → high)",
  "spaces-desc": "Free spaces (high → low)",
  "percent-asc": "% free (low → high)",
  "percent-desc": "% free (high → low)",
};

export function sortParkings(list: Parking[], key: SortKey): Parking[] {
  const sorted = [...list];
  switch (key) {
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "spaces-asc":
      return sorted.sort((a, b) => a.freeSpaces - b.freeSpaces);
    case "spaces-desc":
      return sorted.sort((a, b) => b.freeSpaces - a.freeSpaces);
    case "percent-asc":
      return sorted.sort((a, b) => a.freePercent - b.freePercent);
    case "percent-desc":
      return sorted.sort((a, b) => b.freePercent - a.freePercent);
  }
}

export type Filters = {
  q: string;
  status: string[]; // "open" | "closed"
  lez: string[]; // "inside" | "outside"
  type: string[]; // raw type values, e.g. "carPark"
  bucket: string[]; // "available" | "almost-full" | "full"
};

export function filterParkings(list: Parking[], filters: Filters): Parking[] {
  const q = filters.q.trim().toLowerCase();
  return list.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
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
