import type { z } from "zod";
import { normalizeParking, RawResponseSchema, type Parking } from "./parkings.schema";

const ENDPOINT =
  "https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time&rows=100";

export type RawListResponse = z.infer<typeof RawResponseSchema>;

async function fetchParkingsResponse(): Promise<{
  parkings: Parking[];
  parsed: RawListResponse;
}> {
  const res = await fetch(ENDPOINT, {
    // Live data — never cache. Auto-refresh on the client triggers
    // router.refresh() which re-runs this fetch on the server.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch parkings: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const parsed = RawResponseSchema.parse(json);
  const parkings = parsed.records.map(normalizeParking);
  // Stable name sort by default so the order is deterministic across refreshes.
  parkings.sort((a, b) => a.name.localeCompare(b.name));
  return { parkings, parsed };
}

export async function fetchParkings(): Promise<Parking[]> {
  const { parkings } = await fetchParkingsResponse();
  return parkings;
}

export async function fetchParkingsWithRaw(): Promise<{
  parkings: Parking[];
  raw: RawListResponse;
}> {
  const { parkings, parsed } = await fetchParkingsResponse();
  return { parkings, raw: parsed };
}

export async function fetchParkingById(id: string): Promise<Parking | null> {
  const all = await fetchParkings();
  return all.find((p) => p.id === id) ?? null;
}

export type RawRecord = { recordid: string; fields: Record<string, unknown> };

export async function fetchParkingDetailById(
  id: string,
): Promise<{ parking: Parking; raw: RawRecord } | null> {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch parkings: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const parsed = RawResponseSchema.parse(json);
  for (const record of parsed.records) {
    const parking = normalizeParking(record);
    if (parking.id === id) {
      return { parking, raw: record as RawRecord };
    }
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
