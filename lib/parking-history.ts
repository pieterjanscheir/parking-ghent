import { z } from "zod";

// The Opendatasoft v2.1 "Explore" API caps `limit` at 100 per request, but
// each "recente-bezetting" dataset only holds a few hundred recent points,
// so we just paginate via `offset` until we've drained `total_count`.
//
// Docs: https://help.opendatasoft.com/apis/ods-explore-v2/explore_v2.1.html
const PAGE_LIMIT = 100;
// Hard cap so a misbehaving dataset can't drag a request out forever.
const MAX_PAGES = 20;

const RecordSchema = z.object({
  datetime: z.string(),
  availablespaces: z.number(),
  numberofspaces: z.number(),
});

const ResponseSchema = z.object({
  total_count: z.number(),
  results: z.array(RecordSchema),
});

export type HistoryPoint = {
  timestamp: number;
  isoTime: string;
  freeSpaces: number;
  totalSpaces: number;
  occupiedPercent: number;
  freePercent: number;
};

// Stable id (from `stableIdFromUrl`) → history dataset slug on the
// gent.opendatasoft.com portal. Parkings not listed here have no public
// history feed (Getouw, The Loop, the B-Park sites).
const HISTORY_DATASETS: Record<string, string> = {
  "parking-tolhuis": "recente-bezetting-parking-tolhuis-gent",
  "parking-sint-michiels": "recente-bezetting-parking-sint-michiels-gent",
  "parking-savaanstraat": "recente-bezetting-parking-savaanstraat-gent",
  "parking-sint-pietersplein": "recente-bezetting-parking-sint-pietersplein-gent",
  "parking-reep": "recente-bezetting-parking-reep-gent",
  "parking-ramen": "recente-bezetting-parking-ramen-gent",
  "parking-vrijdagmarkt": "recente-bezetting-parking-vrijdagmarkt",
  "parking-ledeberg": "recente-bezetting-parking-ledeberg-gent",
  "parking-dok-noord": "recente-bezetting-parking-doknoord-gent",
};

export function getHistoryDataset(parkingId: string): string | null {
  return HISTORY_DATASETS[parkingId] ?? null;
}

function endpoint(dataset: string, offset: number): string {
  const params = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    // Server-side sort so the first page already gives us the newest
    // points — useful if we ever decide to short-circuit pagination.
    order_by: "datetime desc",
  });
  return `https://gent.opendatasoft.com/api/explore/v2.1/catalog/datasets/${dataset}/records?${params}`;
}

export async function fetchParkingHistory(
  parkingId: string,
): Promise<HistoryPoint[] | null> {
  const dataset = getHistoryDataset(parkingId);
  if (!dataset) return null;

  const all: z.infer<typeof RecordSchema>[] = [];
  let offset = 0;
  let total = Infinity;

  for (let page = 0; page < MAX_PAGES && offset < total; page++) {
    const res = await fetch(endpoint(dataset, offset), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch history for ${parkingId}: ${res.status} ${res.statusText}`,
      );
    }
    const parsed = ResponseSchema.parse(await res.json());
    total = parsed.total_count;
    all.push(...parsed.results);
    if (parsed.results.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  // Oldest → newest, deduped by timestamp (the API occasionally repeats a
  // sample when readings overlap a minute boundary).
  const seen = new Set<number>();
  const points: HistoryPoint[] = [];
  for (const r of all) {
    const ts = Date.parse(r.datetime);
    if (Number.isNaN(ts) || seen.has(ts)) continue;
    seen.add(ts);
    const total = Math.max(1, r.numberofspaces);
    const free = Math.max(0, Math.min(r.availablespaces, total));
    const freePercent = (free / total) * 100;
    points.push({
      timestamp: ts,
      isoTime: r.datetime,
      freeSpaces: free,
      totalSpaces: total,
      occupiedPercent: 100 - freePercent,
      freePercent,
    });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

export type TrendDirection = "rising" | "falling" | "steady";

export type Trend = {
  // "rising" means occupancy is rising → fewer free spaces.
  direction: TrendDirection;
  // Average change in occupied-% per hour over the trend window.
  slopePerHour: number;
  // Net change in free spaces between window start and end.
  freeSpacesDelta: number;
  // Minutes of data the trend was computed from.
  windowMinutes: number;
  sampleCount: number;
};

// Linear regression of occupied% over time, restricted to the most recent
// `windowMinutes` of data. We pick occupied% (not free count) so the trend
// stays comparable across parkings of different sizes.
export function computeTrend(
  points: HistoryPoint[],
  windowMinutes = 30,
): Trend | null {
  if (points.length < 2) return null;
  const newest = points[points.length - 1].timestamp;
  const cutoff = newest - windowMinutes * 60_000;
  const window = points.filter((p) => p.timestamp >= cutoff);
  if (window.length < 2) return null;

  const t0 = window[0].timestamp;
  // Convert to hours so the slope is in "percentage points per hour",
  // which is easier to reason about than per-millisecond.
  const xs = window.map((p) => (p.timestamp - t0) / 3_600_000);
  const ys = window.map((p) => p.occupiedPercent);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopePerHour = den === 0 ? 0 : num / den;

  // 1pp/hour ≈ noise floor for these feeds. Below that, call it steady.
  let direction: TrendDirection;
  if (slopePerHour > 1) direction = "rising";
  else if (slopePerHour < -1) direction = "falling";
  else direction = "steady";

  const first = window[0];
  const last = window[window.length - 1];
  return {
    direction,
    slopePerHour,
    freeSpacesDelta: last.freeSpaces - first.freeSpaces,
    windowMinutes: Math.round((last.timestamp - first.timestamp) / 60_000),
    sampleCount: window.length,
  };
}
