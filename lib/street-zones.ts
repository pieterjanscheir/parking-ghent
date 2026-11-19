import { z } from "zod";
import type { LatLng } from "./geo";
import { cached } from "./ttl-cache";
import { fetchUpstream } from "./upstream";

// The city's street-parking zones: coloured areas, each with its own rates
// and maximum stay, plus the blue zones where a parking disc applies. We only
// say which zone a spot is in and link to the city's page for the rules —
// the rates themselves aren't in the data.
const ENDPOINT =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/parkeertariefzones-gent/records?limit=100";

const ZONES_TTL_MS = 24 * 60 * 60_000;
const RETRY_AFTER_MS = 60_000;

// Where the city explains the rates. Used when the data carries no link.
export const STREET_RATES_URL =
  "https://stad.gent/nl/mobiliteit-openbare-werken/parkeren/parkeren-op-straat/parkeertarieven-op-straat";

export const ZONE_COLORS = ["red", "orange", "yellow", "green", "blue"] as const;
export type ZoneColor = (typeof ZONE_COLORS)[number];

const COLOR_BY_ID: Record<string, ZoneColor> = {
  TARROOD: "red",
  TARORANJE: "orange",
  TARGEEL: "yellow",
  TARGROEN: "green",
  TARBLAUW: "blue",
};

type Ring = [number, number][];
// One polygon: an outer ring followed by any holes. Coordinates are [lng, lat].
type Polygon = Ring[];

export type StreetZone = { color: ZoneColor; url: string; polygons: Polygon[] };

const PositionSchema = z.tuple([z.number(), z.number()]).rest(z.number());
const RingSchema = z.array(PositionSchema).min(4);
const GeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(RingSchema).min(1) }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(RingSchema).min(1)),
  }),
]);
const RecordSchema = z.object({
  id: z.string(),
  url: z.string().nullish(),
  geometry: z.object({ geometry: GeometrySchema }),
});
const ResponseSchema = z.object({ results: z.array(z.unknown()) });

function officialUrl(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? "");
    // Only ever link to the city's own site.
    if (url.protocol === "https:" && /(^|\.)stad\.gent$/.test(url.hostname)) return url.href;
  } catch {
    /* fall through */
  }
  return STREET_RATES_URL;
}

export function parseStreetZones(json: unknown): StreetZone[] {
  const zones: StreetZone[] = [];
  for (const raw of ResponseSchema.parse(json).results) {
    const parsed = RecordSchema.safeParse(raw);
    if (!parsed.success) continue;
    const color = COLOR_BY_ID[parsed.data.id];
    if (!color) continue;
    const geometry = parsed.data.geometry.geometry;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    zones.push({
      color,
      url: officialUrl(parsed.data.url),
      polygons: polygons.map((polygon) =>
        polygon.map((ring) => ring.map(([lng, lat]): [number, number] => [lng, lat])),
      ),
    });
  }
  return zones;
}

export function fetchStreetZones(): Promise<StreetZone[]> {
  return cached(
    "street-zones",
    { ttlMs: ZONES_TTL_MS, errorTtlMs: RETRY_AFTER_MS, staleIfError: true },
    async () => {
      const res = await fetchUpstream(ENDPOINT);
      if (!res.ok) throw new Error(`Street zones failed: ${res.status} ${res.statusText}`);
      return parseStreetZones(JSON.parse(res.text));
    },
  );
}

// Ray casting: count how often a line from the point to the east crosses the
// ring's edges. Odd means inside.
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygon(point: LatLng, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  return (
    inRing(point.lng, point.lat, outer) &&
    !holes.some((hole) => inRing(point.lng, point.lat, hole))
  );
}

// The zone a spot is in, or null when it is in none. Where zones overlap, the
// strictest wins (red before orange, …, blue last): better to expect the
// tighter rule and be pleasantly surprised.
export function zoneAt(
  zones: StreetZone[],
  point: LatLng,
): { color: ZoneColor; url: string } | null {
  let best: StreetZone | null = null;
  for (const zone of zones) {
    if (!zone.polygons.some((polygon) => inPolygon(point, polygon))) continue;
    if (!best || ZONE_COLORS.indexOf(zone.color) < ZONE_COLORS.indexOf(best.color)) best = zone;
  }
  return best ? { color: best.color, url: best.url } : null;
}
