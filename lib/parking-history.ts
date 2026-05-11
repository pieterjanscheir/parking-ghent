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

// Bulk-fetch trends for every parking we have history for. A failed feed for
// one parking shouldn't take down the page, so failures are swallowed into
// `null` and absent ids just won't get a badge in the UI.
export async function fetchAllTrends(): Promise<Record<string, Trend>> {
  const ids = parkingsWithHistory();
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const points = await fetchParkingHistory(id);
        if (!points) return [id, null] as const;
        return [id, computeTrend(points)] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  const out: Record<string, Trend> = {};
  for (const [id, trend] of results) {
    if (trend) out[id] = trend;
  }
  return out;
}

export type TrendDirection = "rising" | "falling" | "steady";
export type TrendConfidence = "high" | "medium" | "low";

export type ForecastPoint = {
  timestamp: number;
  freeSpaces: number;
  freeLo: number;
  freeHi: number;
};

export type Forecast = {
  horizonMinutes: number;
  atTimestamp: number;
  predictedFreeSpaces: number;
  predictedOccupiedPercent: number;
  // 95% prediction-interval bounds, in free-spaces (lo ≤ predicted ≤ hi).
  freeSpacesBand: [number, number];
  // Series of points from now → now+horizon so the band can be drawn as it
  // widens out with prediction distance.
  series: ForecastPoint[];
};

export type Trend = {
  // "rising" = occupancy rising = fewer free spaces.
  direction: TrendDirection;
  // Average change in occupied-% per hour. Independent of parking size.
  slopePerHour: number;
  // Standard error of the slope, same units. Drives the significance test.
  slopeStdErr: number;
  // slope / stdErr. |t| ≥ 2 ⇒ slope is distinguishable from zero at ~95%.
  tStatistic: number;
  // Qualitative summary of t: high (|t|≥4), medium (≥2), low (<2).
  confidence: TrendConfidence;
  // Net change in free spaces from window start → end (observed, not modelled).
  freeSpacesDelta: number;
  windowMinutes: number;
  sampleCount: number;
  forecast: Forecast;
};

// ---- Tunables ---------------------------------------------------------------
// 60 min gives a stable baseline; 15-min half-life makes the last quarter-hour
// dominate the fit, so the trend still reacts quickly to genuine shifts.
const TREND_WINDOW_MIN = 60;
const HALFLIFE_MIN = 15;
// 15 min is enough to be useful ("can I make it before it fills up?") but short
// enough that extrapolating a local linear trend is defensible.
const FORECAST_HORIZON_MIN = 15;
const FORECAST_STEPS = 6;
// ~95% two-sided for the effective sample sizes we work with (n_eff ≈ 15–25,
// t_{0.025, 13–23} ≈ 2.07–2.16). Close enough for a UI signal.
const T_CRITICAL = 2;

type WlsFit = {
  slope: number;
  intercept: number;
  slopeStdErr: number;
  residualVariance: number;
  effectiveN: number;
  xMean: number;
  sxx: number;
};

// Weighted least squares y = a + b·x with arbitrary positive weights w_i.
// Uses Kish's effective sample size for the degrees-of-freedom correction so
// the standard error is comparable across different weight schemes.
function weightedLeastSquares(
  xs: number[],
  ys: number[],
  ws: number[],
): WlsFit {
  let W = 0;
  let W2 = 0;
  for (const w of ws) {
    W += w;
    W2 += w * w;
  }
  const effectiveN = W2 > 0 ? (W * W) / W2 : ws.length;
  let xMean = 0;
  let yMean = 0;
  for (let i = 0; i < xs.length; i++) {
    xMean += ws[i] * xs[i];
    yMean += ws[i] * ys[i];
  }
  xMean /= W;
  yMean /= W;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - xMean;
    sxx += ws[i] * dx * dx;
    sxy += ws[i] * dx * (ys[i] - yMean);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = yMean - slope * xMean;
  let wrss = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = ys[i] - (intercept + slope * xs[i]);
    wrss += ws[i] * r * r;
  }
  const df = Math.max(1, effectiveN - 2);
  const residualVariance = wrss / df;
  const slopeStdErr = sxx > 0 ? Math.sqrt(residualVariance / sxx) : 0;
  return { slope, intercept, slopeStdErr, residualVariance, effectiveN, xMean, sxx };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Models occupied-% as a locally-linear function of time and projects forward.
// Returns null if there is too little data — silence beats a misleading badge.
export function computeTrend(points: HistoryPoint[]): Trend | null {
  // Need at least ~5 minutes of samples for a meaningful fit.
  if (points.length < 5) return null;

  const newest = points[points.length - 1];
  const cutoff = newest.timestamp - TREND_WINDOW_MIN * 60_000;
  const window = points.filter((p) => p.timestamp >= cutoff);
  if (window.length < 5) return null;

  const totalSpaces = newest.totalSpaces;
  const t0 = window[0].timestamp;
  // Hours since window start → slope is in "percentage points per hour".
  const xs = window.map((p) => (p.timestamp - t0) / 3_600_000);
  const ys = window.map((p) => p.occupiedPercent);

  // Exponential time-decay weights: a sample N minutes old has weight
  // 2^(-N/HALFLIFE_MIN). Recent points dominate without discarding history.
  const newestX = xs[xs.length - 1];
  const halflifeHours = HALFLIFE_MIN / 60;
  const ws = xs.map((x) => Math.pow(2, (x - newestX) / halflifeHours));

  const fit = weightedLeastSquares(xs, ys, ws);

  const t = fit.slopeStdErr > 0 ? fit.slope / fit.slopeStdErr : 0;

  // Significance gate: ignore the sign of small, noisy slopes.
  let direction: TrendDirection;
  if (Math.abs(t) < T_CRITICAL) direction = "steady";
  else if (t > 0) direction = "rising";
  else direction = "falling";

  const absT = Math.abs(t);
  const confidence: TrendConfidence =
    absT >= 4 ? "high" : absT >= T_CRITICAL ? "medium" : "low";

  // Forecast: project forward and compute a 95% prediction interval at each
  // step. Variance has two parts — residual noise (constant) and trend
  // uncertainty that grows with distance from the data's centre — so the band
  // naturally widens with horizon distance.
  const series: ForecastPoint[] = [];
  let predictedFreeAtHorizon = newest.freeSpaces;
  let bandAtHorizon: [number, number] = [newest.freeSpaces, newest.freeSpaces];
  let predictedOccupiedAtHorizon = newest.occupiedPercent;

  for (let i = 0; i <= FORECAST_STEPS; i++) {
    const dxHours = (FORECAST_HORIZON_MIN / 60) * (i / FORECAST_STEPS);
    const xFuture = newestX + dxHours;
    const tsFuture = newest.timestamp + dxHours * 3_600_000;
    const occupiedPred = fit.intercept + fit.slope * xFuture;
    const xCentered = xFuture - fit.xMean;
    // Prediction-interval variance for a *new observation* (= residual noise
    // + uncertainty in the fitted line at xFuture).
    const piVar =
      fit.residualVariance *
      (1 + 1 / fit.effectiveN + (fit.sxx > 0 ? (xCentered * xCentered) / fit.sxx : 0));
    const halfWidth = T_CRITICAL * Math.sqrt(piVar);
    const occupiedCentral = clamp(occupiedPred, 0, 100);
    const occupiedHi = clamp(occupiedPred + halfWidth, 0, 100);
    const occupiedLo = clamp(occupiedPred - halfWidth, 0, 100);
    // Free spaces: lo occupied ⇒ hi free, and vice-versa.
    const freeCentral = clamp(Math.round((totalSpaces * (100 - occupiedCentral)) / 100), 0, totalSpaces);
    const freeLo = clamp(Math.round((totalSpaces * (100 - occupiedHi)) / 100), 0, totalSpaces);
    const freeHi = clamp(Math.round((totalSpaces * (100 - occupiedLo)) / 100), 0, totalSpaces);
    series.push({ timestamp: tsFuture, freeSpaces: freeCentral, freeLo, freeHi });
    if (i === FORECAST_STEPS) {
      predictedFreeAtHorizon = freeCentral;
      bandAtHorizon = [freeLo, freeHi];
      predictedOccupiedAtHorizon = occupiedCentral;
    }
  }

  return {
    direction,
    slopePerHour: fit.slope,
    slopeStdErr: fit.slopeStdErr,
    tStatistic: t,
    confidence,
    freeSpacesDelta: newest.freeSpaces - window[0].freeSpaces,
    windowMinutes: Math.round((newest.timestamp - window[0].timestamp) / 60_000),
    sampleCount: window.length,
    forecast: {
      horizonMinutes: FORECAST_HORIZON_MIN,
      atTimestamp: newest.timestamp + FORECAST_HORIZON_MIN * 60_000,
      predictedFreeSpaces: predictedFreeAtHorizon,
      predictedOccupiedPercent: predictedOccupiedAtHorizon,
      freeSpacesBand: bandAtHorizon,
      series,
    },
  };
}
