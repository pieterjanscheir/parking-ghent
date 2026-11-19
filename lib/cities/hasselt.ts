import { z } from "zod";
import type { DirectoryEntry } from "../directory";
import { bucketFor, type Parking } from "../parkings.schema";
import { cached } from "../ttl-cache";
import { fetchUpstream } from "../upstream";

// Hasselt's car parks, from the two files the city's own "Vind een parking"
// page reads:
//
//  - parking_occupancy.xml: free spaces and vehicles per car park, a DATEX II
//    status publication supplied by Be-Mobile and rewritten every few minutes;
//  - the website's list of car parks: names, addresses and positions, with
//    the id the XML uses.
//
// Neither is published as open data or documented, and no licence is stated:
// they can move or change without notice. Everything here fails soft.
const OCCUPANCY_URL = "https://www.hasselt.be/sites/default/files/parking_occupancy.xml";
const SITES_URL =
  "https://www.hasselt.be/nl/jsonapi/node/contact" +
  "?filter%5Bp%5D%5Bcondition%5D%5Bpath%5D=field_parking_id" +
  "&filter%5Bp%5D%5Bcondition%5D%5Boperator%5D=IS%20NOT%20NULL" +
  "&page%5Blimit%5D=50" +
  "&fields%5Bnode--contact%5D=title,field_parking_id,field_coordinates,field_address,path";
const SITE = "https://www.hasselt.be/nl";

const LIVE_TTL_MS = 60_000;
const SITES_TTL_MS = 24 * 60 * 60_000;

export type Status = {
  id: string;
  free: number | null;
  vehicles: number | null;
  // "open", "closed" or null when the file doesn't say.
  opening: string | null;
  updatedAt: number | null;
};

const text = (block: string, tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block)?.[1].trim() ?? null;

const count = (block: string, tag: string) => {
  const value = text(block, tag);
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
};

// The file has two records per car park, one with the counts and one with
// whether it is open; they are merged on the car park's id. Only the handful
// of elements used here are read, so there is no XML parser: each record is
// a flat block of simple tags.
export function parseStatus(xml: string): Status[] {
  const byId = new Map<string, Status>();
  for (const [block] of xml.matchAll(/<parkingRecordStatus[\s>][\s\S]*?<\/parkingRecordStatus>/g)) {
    const id = /<parkingRecordReference\b[^>]*\bid="([^"]+)"/.exec(block)?.[1];
    if (!id) continue;
    const status = byId.get(id) ?? { id, free: null, vehicles: null, opening: null, updatedAt: null };
    status.free = count(block, "parkingNumberOfVacantSpaces") ?? status.free;
    status.vehicles = count(block, "parkingNumberOfVehicles") ?? status.vehicles;
    status.opening = text(block, "parkingSiteOpeningStatus") ?? status.opening;
    const at = Date.parse(text(block, "parkingStatusOriginTime") ?? "");
    if (Number.isFinite(at)) status.updatedAt = Math.max(status.updatedAt ?? 0, at);
    byId.set(id, status);
  }
  return [...byId.values()];
}

const SiteSchema = z.object({
  attributes: z.object({
    title: z.string(),
    field_parking_id: z.string(),
    field_coordinates: z.object({ lat: z.number(), lng: z.number() }).nullish(),
    field_address: z.object({ address_line1: z.string().nullish() }).nullish(),
    path: z.object({ alias: z.string().nullish() }).nullish(),
  }),
});

export type Site = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  url: string;
  parkAndRide: boolean;
};

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parseSites(json: unknown): Site[] {
  const sites: Site[] = [];
  for (const raw of z.object({ data: z.array(z.unknown()) }).parse(json).data) {
    const parsed = SiteSchema.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data.attributes;
    // The website writes underground car parks as "P^ Luikerpoort".
    const name = a.title.replace(/^P\^\s*/, "Parking ").replace(/\s+/g, " ").trim();
    const alias = a.path?.alias ?? "";
    sites.push({
      id: a.field_parking_id,
      name,
      address: (a.field_address?.address_line1 ?? "").trim(),
      lat: a.field_coordinates?.lat ?? null,
      lng: a.field_coordinates?.lng ?? null,
      url: alias.startsWith("/") ? `${SITE}${alias}` : "",
      // The city's own naming: "Parking P+R carpool Hasselt-Zuid". The one
      // marked for motorhomes is not somewhere to leave a car and ride in.
      parkAndRide: /\bP\+R\b/i.test(name) && !/mobilhome/i.test(name),
    });
  }
  return sites;
}

// Car parks with a count become live garages; a car park the city lists but
// the file has no record for goes with the ones without a count. Records in
// the file that match no listed car park are dropped: there is no name or
// place to show for them.
export function toHasselt(
  statuses: Status[],
  sites: Site[],
): { parkings: Parking[]; extras: DirectoryEntry[] } {
  const byId = new Map(statuses.map((status) => [status.id, status]));
  const parkings: Parking[] = [];
  const extras: DirectoryEntry[] = [];
  for (const site of sites) {
    const id = slug(site.name) || site.id;
    const status = byId.get(site.id);
    if (!status) {
      if (site.lat === null || site.lng === null) continue;
      extras.push({
        id,
        name: site.name,
        lat: site.lat,
        lng: site.lng,
        parkAndRide: site.parkAndRide,
        capacity: null,
        address: site.address,
        url: site.url || null,
        note: null,
        isFree: null,
        evChargers: 0,
        evMaxKw: null,
      });
      continue;
    }
    // The file gives no capacity; the city's own page adds the two counts.
    const total = (status.free ?? 0) + (status.vehicles ?? 0);
    const hasLiveData = status.free !== null && status.vehicles !== null && total > 0;
    const isOpen = status.opening !== "closed";
    const free = status.free ?? 0;
    const freePercent = total > 0 ? (free / total) * 100 : 0;
    parkings.push({
      id,
      name: site.name,
      description: "",
      openingHours: "",
      websiteUrl: site.url,
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
      address: site.address,
      lat: site.lat,
      lng: site.lng,
      phone: null,
      lastUpdatedAt: status.updatedAt,
      isFree: false,
      parkAndRide: site.parkAndRide,
      evChargers: 0,
      evMaxKw: null,
      note: null,
    });
  }
  return {
    parkings: parkings.sort((a, b) => a.name.localeCompare(b.name)),
    extras: extras.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// A list with nothing usable in it is a broken answer, not a city without
// car parks: refusing it keeps it out of the cache.
export function usableSites(json: unknown): Site[] {
  const sites = parseSites(json);
  if (sites.length === 0) throw new Error("Hasselt's list of car parks is empty");
  return sites;
}

async function fetchText(url: string, what: string): Promise<string> {
  const res = await fetchUpstream(url);
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${res.statusText}`);
  return res.text;
}

// Names and positions change rarely; a failing list is retried once a minute
// and the last good one is used meanwhile.
const fetchSites = () =>
  cached("hasselt-sites", { ttlMs: SITES_TTL_MS, errorTtlMs: 60_000, staleIfError: true }, async () =>
    usableSites(JSON.parse(await fetchText(SITES_URL, "Hasselt's list of car parks"))),
  );

export function fetchHasselt(): Promise<{ parkings: Parking[]; extras: DirectoryEntry[] }> {
  return cached("hasselt-live", { ttlMs: LIVE_TTL_MS }, async () => {
    // Without the list of car parks the counts have no names: both are needed.
    const [xml, sites] = await Promise.all([fetchText(OCCUPANCY_URL, "Hasselt's occupancy file"), fetchSites()]);
    const statuses = parseStatus(xml);
    if (statuses.length === 0) throw new Error("Hasselt's occupancy file has no car parks in it");
    return toHasselt(statuses, sites);
  });
}
