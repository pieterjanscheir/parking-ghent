import { z } from "zod";
import type { RawApiCall } from "./parkings";
import { computeTrend, type Trend } from "./forecast";
import { cached } from "./ttl-cache";
import { fetchUpstream } from "./upstream";

// The Opendatasoft v2.1 "Explore" API caps `limit` at 100 per request, but
// each "recente-bezetting" dataset only holds a few hundred recent points,
// so we just paginate via `offset` until we've drained `total_count`.
//
// Docs: https://help.opendatasoft.com/apis/ods-explore-v2/explore_v2.1.html
const PAGE_LIMIT = 100;
// Hard cap so a misbehaving dataset can't drag a request out forever.
const MAX_PAGES = 20;
// History gains one point roughly every minute, so refetching more often only
// costs upstream calls. The whole (multi-page) series is cached as one unit so
// the pages always belong to the same moment.
export const HISTORY_TTL_MS = 60_000;

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
  "parking-savaan": "recente-bezetting-parking-savaanstraat-gent",
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

export function parkingsWithHistory(): string[] {
  return Object.keys(HISTORY_DATASETS);
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
  const result = await fetchParkingHistoryWithRaw(parkingId);
  return result?.points ?? null;
}

type HistoryResult = { points: HistoryPoint[]; calls: RawApiCall[] };

// Shared by the overview (trend badges for every garage) and the detail page
// (chart), so opening a garage right after the overview costs no extra calls.
// Callers must treat the result as read-only.
export async function fetchParkingHistoryWithRaw(
  parkingId: string,
): Promise<HistoryResult | null> {
  const dataset = getHistoryDataset(parkingId);
  if (!dataset) return null;
  return cached(`history:${dataset}`, { ttlMs: HISTORY_TTL_MS }, () =>
    loadParkingHistory(parkingId, dataset),
  );
}

async function loadParkingHistory(
  parkingId: string,
  dataset: string,
): Promise<HistoryResult> {
  const all: z.infer<typeof RecordSchema>[] = [];
  const calls: RawApiCall[] = [];
  let offset = 0;
  let total = Infinity;

  for (let page = 0; page < MAX_PAGES && offset < total; page++) {
    const url = endpoint(dataset, offset);
    const res = await fetchUpstream(url);
    const text = await res.text();
    let raw: unknown;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = text;
    }
    calls.push({
      id: `${dataset}-p${page}`,
      title: `${dataset} (page ${page + 1})`,
      subtitle: `gent.opendatasoft.com — Explore v2.1, offset ${offset}`,
      url,
      ok: res.ok,
      data: res.ok
        ? raw
        : { error: `${res.status} ${res.statusText}`, body: raw },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch history for ${parkingId}: ${res.status} ${res.statusText}`,
      );
    }
    const parsed = ResponseSchema.parse(raw);
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
  return { points, calls };
}

// Bulk-fetch trends for every parking we have history for. A failed feed for
// one parking shouldn't take down the page, so failures are swallowed into
// `null` and absent ids just won't get a badge in the UI.
export async function fetchAllTrends(): Promise<Record<string, Trend>> {
  const { trendsById } = await fetchAllTrendsWithRaw();
  return trendsById;
}

export async function fetchAllTrendsWithRaw(): Promise<{
  trendsById: Record<string, Trend>;
  calls: RawApiCall[];
}> {
  const ids = parkingsWithHistory();
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const result = await fetchParkingHistoryWithRaw(id);
        if (!result) return { id, trend: null, calls: [] as RawApiCall[] };
        return {
          id,
          trend: computeTrend(result.points),
          calls: result.calls,
        };
      } catch {
        return { id, trend: null, calls: [] as RawApiCall[] };
      }
    }),
  );
  const trendsById: Record<string, Trend> = {};
  const calls: RawApiCall[] = [];
  for (const { id, trend, calls: pageCalls } of results) {
    if (trend) trendsById[id] = trend;
    calls.push(...pageCalls);
  }
  return { trendsById, calls };
}

export {
  computeTrend,
  type Forecast,
  type ForecastAccuracy,
  type ForecastMethod,
  type ForecastPoint,
  type HorizonForecast,
  type Trend,
  type TrendConfidence,
  type TrendDirection,
} from "./forecast";
