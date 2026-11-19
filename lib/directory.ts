import { z } from "zod";
import { distanceKm, type LatLng } from "./geo";
import { cached } from "./ttl-cache";
import { fetchUpstream } from "./upstream";

// The city's list of every public car park in Ghent: the garages that also
// appear in the live feed, plus the ones that don't report counts — the Park &
// Ride lots and the privately run garages (Kouter, Zuid, Center …). We show
// those too, without a count, because "where can I park?" has more answers
// than "which garages publish numbers?".
//
// Docs: https://help.opendatasoft.com/apis/ods-explore-v2/explore_v2.1.html
const ENDPOINT =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/locaties-openbare-parkings-gent/records?limit=100";

// Car parks don't move, and their notes change rarely.
const DIRECTORY_TTL_MS = 24 * 60 * 60_000;
const RETRY_AFTER_MS = 60_000;

const RecordSchema = z.object({
  naam: z.string(),
  parking: z.string().nullish(),
  type: z.string().nullish(),
  straatnaam: z.string().nullish(),
  huisnr: z.string().nullish(),
  capaciteit: z.number().nullish(),
  url: z.string().nullish(),
  urid: z.string().nullish(),
  infotekst: z.string().nullish(),
  enginfotekst: z.string().nullish(),
  frinfotekst: z.string().nullish(),
  geo_point_2d: z.object({ lat: z.number(), lon: z.number() }).nullish(),
});

const ResponseSchema = z.object({ results: z.array(z.unknown()) });

// The city writes its notes in Dutch, English and French. Other languages
// fall back to English (see `noteFor`).
export type LocalizedNote = { nl: string; en: string | null; fr: string | null };

export type DirectoryEntry = LatLng & {
  id: string;
  name: string;
  parkAndRide: boolean;
  capacity: number | null;
  address: string;
  // The operator's or the city's page about this car park.
  url: string | null;
  note: LocalizedNote | null;
  // Free of charge? Only known where the city's note says so.
  isFree: boolean | null;
  evChargers: number;
  evMaxKw: number | null;
};

// "-" and blank mean "nothing to say".
function cleanNote(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  return text === "" || /^[-–?]+$/.test(text) ? null : text;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseDirectory(json: unknown): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  const seen = new Set<string>();
  for (const raw of ResponseSchema.parse(json).results) {
    // One odd record shouldn't cost us the other thirty-six.
    const parsed = RecordSchema.safeParse(raw);
    if (!parsed.success) continue;
    const r = parsed.data;
    const point = r.geo_point_2d;
    if (!point) continue;
    const name = r.naam.trim();
    if (!name) continue;
    const parkAndRide =
      (r.parking ?? "").trim().toUpperCase() === "P+R" ||
      /park\s*(and|&)\s*ride/i.test(r.type ?? "");
    const id = `${parkAndRide ? "pr" : "p"}-${slugify(name)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const nl = cleanNote(r.infotekst);
    const street = (r.straatnaam ?? "").trim();
    const number = (r.huisnr ?? "").trim();
    entries.push({
      id,
      name,
      parkAndRide,
      capacity: r.capaciteit && r.capaciteit > 0 ? r.capaciteit : null,
      address: street ? (number ? `${street} ${number}` : street) : "",
      lat: point.lat,
      lng: point.lon,
      url: isHttpUrl(r.url) ? r.url : null,
      note: nl
        ? { nl, en: cleanNote(r.enginfotekst), fr: cleanNote(r.frinfotekst) }
        : null,
      // The notes open with "P+R gratis." or "Parking betalend." where the
      // city wants visitors to know; anything else stays unknown.
      isFree: nl ? priceFromNote(nl) : null,
      evChargers: 0,
      evMaxKw: null,
    });
  }
  return entries;
}

export function fetchDirectory(): Promise<DirectoryEntry[]> {
  // If a refresh fails, yesterday's list is still right — and a failing list
  // isn't worth another wait on every page view.
  return cached(
    "directory",
    { ttlMs: DIRECTORY_TTL_MS, errorTtlMs: RETRY_AFTER_MS, staleIfError: true },
    loadDirectory,
  );
}

async function loadDirectory(): Promise<DirectoryEntry[]> {
  const res = await fetchUpstream(ENDPOINT);
  if (!res.ok) throw new Error(`Parking directory failed: ${res.status} ${res.statusText}`);
  return parseDirectory(JSON.parse(res.text));
}

// The note in the visitor's language, or English, or Dutch.
// Only the opening sentence says what parking costs. A later "Gratis
// fietsenstalling" (free bike parking) must not make a paid car park free.
function priceFromNote(nl: string): boolean | null {
  const opening = nl.split(/[.!?]/, 1)[0];
  if (/\bbetalend\b/i.test(opening)) return false;
  if (/\bgratis\b/i.test(opening)) return true;
  return null;
}

export function noteFor(note: LocalizedNote | null, locale: string): string | null {
  return localizedNote(note, locale)?.text ?? null;
}

// The same remark together with the language it is actually in, which is not
// always the one asked for: a French visitor gets the English text when the
// city wrote no French one. For the `lang` attribute, so screen readers
// pronounce it right.
export function localizedNote(
  note: LocalizedNote | null,
  locale: string,
): { text: string; lang: "nl" | "en" | "fr" } | null {
  if (!note) return null;
  if (locale === "fr" && note.fr) return { text: note.fr, lang: "fr" };
  if (locale !== "nl" && note.en) return { text: note.en, lang: "en" };
  return { text: note.nl, lang: "nl" };
}

// --- Which directory entries are garages we already have live? -------------

type LiveGarage = { id: string; name: string; lat: number | null; lng: number | null };

// Same building: the two datasets place a garage's pin up to ~100 m apart
// (entrance versus centre), while different garages in the centre start at
// about 150 m (Kouter and Savaan).
const SAME_PLACE_KM = 0.11;

function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(b-park|p\+r|het|parking)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameName(entry: string, live: string): boolean {
  const a = nameKey(entry);
  const b = nameKey(live);
  // "The Loop C" belongs to the live feed's single "The Loop".
  return a === b || a.startsWith(`${b} `);
}

export type DirectoryMatch = {
  // Car parks the live feed doesn't cover.
  extras: DirectoryEntry[];
  // What the directory knows about each live garage.
  byLiveId: Record<string, DirectoryEntry[]>;
};

export function matchDirectory(entries: DirectoryEntry[], live: LiveGarage[]): DirectoryMatch {
  const extras: DirectoryEntry[] = [];
  const byLiveId: Record<string, DirectoryEntry[]> = {};
  for (const entry of entries) {
    let match: LiveGarage | null = null;
    let nearest = Infinity;
    for (const garage of live) {
      if (garage.lat === null || garage.lng === null) continue;
      const km = distanceKm(entry, { lat: garage.lat, lng: garage.lng });
      if (km < nearest) {
        nearest = km;
        match = garage;
      }
    }
    if (!match || nearest > SAME_PLACE_KM) {
      match = live.find((garage) => sameName(entry.name, garage.name)) ?? null;
    }
    if (match) (byLiveId[match.id] ??= []).push(entry);
    else extras.push(entry);
  }
  return { extras, byLiveId };
}

// What the directory adds to a garage from the live feed.
export function directoryFacts(matches: DirectoryEntry[] | undefined): {
  parkAndRide: boolean;
  note: LocalizedNote | null;
} {
  const entries = matches ?? [];
  return {
    // Ledeberg and the station garage are listed twice: as a garage and as a
    // Park & Ride.
    parkAndRide: entries.some((entry) => entry.parkAndRide),
    note: entries.find((entry) => entry.note)?.note ?? null,
  };
}
