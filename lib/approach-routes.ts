import { z } from "zod";
import { cached } from "./ttl-cache";
import { fetchUpstream } from "./upstream";

// The city's recommended driving routes between the ring road (R40, B401)
// and the garages in the centre. Ghent's circulation plan closes many streets
// to through traffic, so "the shortest way" on a map is often not a way in at
// all — these are the streets that are.
//
// The data is a set of road segments, each labelled with what it connects
// ("R40 FT" → "P Sint Michiels, P Ramen"). A two-way street carries both
// directions in one record ("R40 FT - P Vrijdagmarkt"), so we don't try to
// tell "in" from "out": we show the streets that serve a garage.
const ENDPOINT =
  "https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/aanrijroutes-gent/exports/json?select=van,naar,geometry";

const ROUTES_TTL_MS = 24 * 60 * 60_000;
const RETRY_AFTER_MS = 60_000;

const RecordSchema = z.object({
  van: z.string().nullish(),
  naar: z.string().nullish(),
  geometry: z.object({
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(z.tuple([z.number(), z.number()]).rest(z.number())).min(2),
    }),
  }),
});

// [lat, lng] pairs, ready for the map.
export type RouteLine = [number, number][];
export type RouteSegment = { garages: string[]; line: RouteLine };

// "Sint-Michiels", "P Sint Michiels" and "Psintmichiels" are the same garage.
function key(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// The garages a label mentions: every "P <name>" in it.
function garagesIn(label: string | null | undefined): string[] {
  const found: string[] = [];
  for (const part of (label ?? "").split(/,| - /)) {
    const match = /^\s*P\s*([A-Za-z][A-Za-z\s-]*)$/.exec(part);
    if (match) found.push(key(match[1]));
  }
  return found;
}

// ~1 m: plenty for a line on a street map, and a third of the bytes.
const round = (value: number) => Math.round(value * 1e5) / 1e5;

export function parseApproachRoutes(json: unknown): RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (const raw of z.array(z.unknown()).parse(json)) {
    const parsed = RecordSchema.safeParse(raw);
    if (!parsed.success) continue;
    const garages = [...new Set([...garagesIn(parsed.data.van), ...garagesIn(parsed.data.naar)])];
    if (garages.length === 0) continue;
    segments.push({
      garages,
      line: parsed.data.geometry.geometry.coordinates.map(
        ([lng, lat]): [number, number] => [round(lat), round(lng)],
      ),
    });
  }
  return segments;
}

export function fetchApproachRoutes(): Promise<RouteSegment[]> {
  return cached(
    "approach-routes",
    { ttlMs: ROUTES_TTL_MS, errorTtlMs: RETRY_AFTER_MS, staleIfError: true },
    async () => {
      const res = await fetchUpstream(ENDPOINT);
      if (!res.ok) throw new Error(`Approach routes failed: ${res.status} ${res.statusText}`);
      return parseApproachRoutes(JSON.parse(res.text));
    },
  );
}

// The route data says "Center" where the car park is called "Center parking".
const ALIASES: Record<string, string> = { centerparking: "center" };

// The street segments that serve a garage, by the garage's display name.
export function routesForGarage(segments: RouteSegment[], garageName: string): RouteLine[] {
  const wanted = key(garageName.replace(/^(b-park|p\+r|het|parking)\s+/i, ""));
  const name = ALIASES[wanted] ?? wanted;
  return segments.filter((segment) => segment.garages.includes(name)).map((s) => s.line);
}
