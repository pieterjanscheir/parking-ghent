// Short-term occupancy forecast for a single parking.
//
// The city only publishes ~3 hours of minute-level history per garage (no
// longer archive exists), so there is no daily/weekly pattern to learn from.
// Within that window, the model is deliberately simple:
//
//   predicted free(t + m) = now + K · slope · τ · (1 − e^(−m/τ))
//
// where `slope` is the least-squares trend over the last 20 minutes. The
// change saturates at K·slope·τ instead of growing forever: car parks rarely
// keep filling at their current rate for a full hour.
//
// Why this and not something fancier: replaying the live feeds (forecasting
// each point using only the data before it), this beat "nothing changes" by
// ~11% at 15 min, ~10% at 30 min and ~5% at 60 min. The previous model (a
// plain linear extrapolation over 60 min) was *worse* than "nothing changes",
// and so were damped Holt smoothing and undamped linear trends at 30–60 min.
// Neighbouring settings of W / τ / K score within a percent, so these
// constants aren't overfit to one afternoon.
//
// Each parking's forecast is also backtested on its own history. That gives
//  - an honest accuracy figure to show the user,
//  - prediction bands from the real errors at each horizon (no Gaussian
//    assumption), and
//  - a kill switch: if following the trend did worse than "nothing changes"
//    for this parking over the last few hours, we fall back to that.

import type { HistoryPoint } from "./parking-history";

export type TrendDirection = "rising" | "falling" | "steady";
export type TrendConfidence = "high" | "medium" | "low";
export type ForecastMethod = "trend" | "persistence";

export type ForecastPoint = {
  timestamp: number;
  freeSpaces: number;
  freeLo: number;
  freeHi: number;
};

export type HorizonForecast = {
  minutes: number;
  freeSpaces: number;
  freeLo: number;
  freeHi: number;
};

export type ForecastAccuracy = {
  // Mean absolute error (in spaces) at the 30-min horizon, measured by
  // replaying this parking's recent history.
  maeSpaces: number;
  // Same for "nothing changes" — the baseline every forecast must beat.
  naiveMaeSpaces: number;
  // 1 − mae / naiveMae. > 0 means better than the baseline.
  skill: number;
  // Number of backtest forecasts the numbers above are based on.
  backtestCount: number;
};

export type Forecast = {
  method: ForecastMethod;
  // Headline horizon used for the direction badge and one-line summaries.
  horizonMinutes: number;
  atTimestamp: number;
  predictedFreeSpaces: number;
  predictedOccupiedPercent: number;
  // 90% band at the headline horizon, in free spaces (lo ≤ predicted ≤ hi).
  freeSpacesBand: [number, number];
  // Forecasts at the horizons we show in the UI (15 / 30 / 60 min).
  horizons: HorizonForecast[];
  // From now → now+60 min in 5-minute steps, for the chart.
  series: ForecastPoint[];
  // Minutes until the central forecast drops below the "full" threshold, or
  // null if that doesn't happen within the forecast window.
  minutesUntilFull: number | null;
  accuracy: ForecastAccuracy;
};

export type Trend = {
  // "rising" = occupancy rising = fewer free spaces.
  direction: TrendDirection;
  confidence: TrendConfidence;
  // Observed net change in free spaces over the last ~30 min.
  freeSpacesDelta: number;
  windowMinutes: number;
  sampleCount: number;
  forecast: Forecast;
};

// ---- Tunables (see header for how these were chosen) ------------------------
const SLOPE_WINDOW_MIN = 20;
const TAU_MIN = 15;
const K = 0.75;
const STEP_MIN = 5;
const MAX_HORIZON_STEPS = 12; // 60 min
const HEADLINE_STEPS = 6; // 30 min
const DISPLAY_HORIZONS = [3, 6, 12]; // 15, 30, 60 min
const BAND_QUANTILE = 0.9;
// A backtest target must have a reading within this distance of the time.
const MATCH_TOLERANCE_MS = 3 * 60_000;
// Mirrors bucketFor() in parkings.schema.ts: < 5% free counts as full.
const FULL_FREE_FRACTION = 0.05;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Least-squares slope of free spaces (per minute) over the readings in the
// SLOPE_WINDOW_MIN before points[end]. Returns 0 when there's too little data.
export function recentSlope(points: HistoryPoint[], end = points.length - 1): number {
  const tEnd = points[end].timestamp;
  const cutoff = tEnd - SLOPE_WINDOW_MIN * 60_000;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = end; i >= 0 && points[i].timestamp >= cutoff; i--) {
    n++;
    sx += (points[i].timestamp - tEnd) / 60_000;
    sy += points[i].freeSpaces;
  }
  if (n < 4) return 0;
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = end; i >= 0 && points[i].timestamp >= cutoff; i--) {
    const dx = (points[i].timestamp - tEnd) / 60_000 - mx;
    sxx += dx * dx;
    sxy += dx * (points[i].freeSpaces - my);
  }
  return sxx > 0 ? sxy / sxx : 0;
}

// Expected change in free spaces m minutes ahead, given a slope per minute.
export function predictedChange(slopePerMin: number, minutes: number): number {
  return K * slopePerMin * TAU_MIN * (1 - Math.exp(-minutes / TAU_MIN));
}

// Index of the reading closest to `t`, or -1 if none within tolerance.
// `from` lets the caller resume the scan (origins are processed in order).
function nearestIndex(points: HistoryPoint[], t: number, from: number): number {
  let i = from;
  while (i + 1 < points.length && points[i + 1].timestamp <= t) i++;
  let best = i;
  if (i + 1 < points.length && Math.abs(points[i + 1].timestamp - t) < Math.abs(points[i].timestamp - t)) {
    best = i + 1;
  }
  return Math.abs(points[best].timestamp - t) <= MATCH_TOLERANCE_MS ? best : -1;
}

type Backtest = { model: number[][]; naive: number[][] };

// Replays history: every 5 minutes, forecast 5…60 min ahead using only the
// readings up to that moment, and record the absolute errors per horizon.
function backtest(points: HistoryPoint[]): Backtest {
  const model: number[][] = Array.from({ length: MAX_HORIZON_STEPS + 1 }, () => []);
  const naive: number[][] = Array.from({ length: MAX_HORIZON_STEPS + 1 }, () => []);
  const start = points[0].timestamp + SLOPE_WINDOW_MIN * 60_000;
  const end = points[points.length - 1].timestamp;
  let originIdx = 0;
  for (let t = start; t < end; t += STEP_MIN * 60_000) {
    while (originIdx + 1 < points.length && points[originIdx + 1].timestamp <= t) originIdx++;
    const origin = points[originIdx];
    const slope = recentSlope(points, originIdx);
    let scan = originIdx;
    for (let h = 1; h <= MAX_HORIZON_STEPS; h++) {
      const target = origin.timestamp + h * STEP_MIN * 60_000;
      if (target > end + MATCH_TOLERANCE_MS) break;
      const j = nearestIndex(points, target, scan);
      if (j === -1) continue;
      scan = j;
      const actual = points[j].freeSpaces;
      model[h].push(Math.abs(actual - (origin.freeSpaces + predictedChange(slope, h * STEP_MIN))));
      naive[h].push(Math.abs(actual - origin.freeSpaces));
    }
  }
  return { model, naive };
}

// Half-width of the band at each horizon: the empirical error quantile where
// the backtest has enough samples, otherwise the last reliable width grown
// with √h. Always non-decreasing in h.
function bandWidths(errors: number[][], totalSpaces: number): number[] {
  const widths = new Array<number>(MAX_HORIZON_STEPS + 1).fill(0);
  // Floor: readings jitter by a space or two even when nothing happens.
  const floor = Math.max(1, totalSpaces * 0.005);
  let lastH = 0;
  let lastW = floor;
  for (let h = 1; h <= MAX_HORIZON_STEPS; h++) {
    let w: number;
    if (errors[h].length >= 6) {
      w = quantile(errors[h], BAND_QUANTILE);
      lastH = h;
      lastW = w;
    } else {
      w = lastH > 0 ? lastW * Math.sqrt(h / lastH) : floor * 2 * Math.sqrt(h);
    }
    widths[h] = Math.max(w, floor, widths[h - 1]);
  }
  return widths;
}

function horizonMae(errors: number[][], h: number): { mae: number; n: number } {
  // Fall back to the furthest horizon that has data if the window is short.
  for (let k = h; k >= 1; k--) {
    if (errors[k].length > 0) return { mae: mean(errors[k]), n: errors[k].length };
  }
  return { mae: NaN, n: 0 };
}

// Returns null if there's too little data — silence beats a misleading badge.
export function computeTrend(points: HistoryPoint[]): Trend | null {
  if (points.length < 5) return null;
  const newest = points[points.length - 1];
  const spanMin = (newest.timestamp - points[0].timestamp) / 60_000;
  if (spanMin < SLOPE_WINDOW_MIN) return null;
  const totalSpaces = Math.max(0, newest.totalSpaces);

  const bt = backtest(points);
  const model = horizonMae(bt.model, HEADLINE_STEPS);
  const naive = horizonMae(bt.naive, HEADLINE_STEPS);
  const haveBacktest = model.n >= 6;
  const skill =
    haveBacktest && naive.mae > 0 ? 1 - model.mae / naive.mae : 0;

  // Trust the trend unless replaying this parking's history says it hurts.
  // With too little history to judge, go with the trend (it wins on average).
  // A zero baseline error means nothing moved, so the trend can't have hurt.
  const trendHurt = haveBacktest && naive.mae > 0 && skill <= 0;
  const method: ForecastMethod = trendHurt ? "persistence" : "trend";
  const widths = bandWidths(method === "trend" ? bt.model : bt.naive, totalSpaces);
  const slope = method === "trend" ? recentSlope(points) : 0;
  const now = newest.freeSpaces;

  const toFree = (v: number) => clamp(Math.round(v), 0, totalSpaces);
  const series: ForecastPoint[] = [];
  for (let h = 0; h <= MAX_HORIZON_STEPS; h++) {
    const central = now + predictedChange(slope, h * STEP_MIN);
    const w = h === 0 ? 0 : widths[h];
    series.push({
      timestamp: newest.timestamp + h * STEP_MIN * 60_000,
      freeSpaces: toFree(central),
      freeLo: toFree(central - w),
      freeHi: toFree(central + w),
    });
  }

  const horizons: HorizonForecast[] = DISPLAY_HORIZONS.map((h) => ({
    minutes: h * STEP_MIN,
    freeSpaces: series[h].freeSpaces,
    freeLo: series[h].freeLo,
    freeHi: series[h].freeHi,
  }));

  const fullThreshold = totalSpaces * FULL_FREE_FRACTION;
  let minutesUntilFull: number | null = null;
  if (now >= fullThreshold) {
    for (let h = 1; h <= MAX_HORIZON_STEPS; h++) {
      if (series[h].freeSpaces < fullThreshold) {
        minutesUntilFull = h * STEP_MIN;
        break;
      }
    }
  }

  const headline = series[HEADLINE_STEPS];
  const delta = headline.freeSpaces - now;
  // A change of a couple of spaces (or <1% of capacity) is not news.
  const meaningful = Math.max(3, totalSpaces * 0.01);
  let direction: TrendDirection = "steady";
  if (method === "trend" && Math.abs(delta) >= meaningful) {
    direction = delta < 0 ? "rising" : "falling";
  }

  const confidence: TrendConfidence = !haveBacktest
    ? "low"
    : skill >= 0.2
      ? "high"
      : skill >= 0.05
        ? "medium"
        : "low";

  // Observed change over the last ~30 min, from raw readings.
  const cutoff = newest.timestamp - 30 * 60_000;
  const ref = points.find((p) => p.timestamp >= cutoff) ?? points[0];
  const chosen = method === "trend" ? model : naive;

  return {
    direction,
    confidence,
    freeSpacesDelta: now - ref.freeSpaces,
    windowMinutes: Math.round(spanMin),
    sampleCount: points.length,
    forecast: {
      method,
      horizonMinutes: HEADLINE_STEPS * STEP_MIN,
      atTimestamp: headline.timestamp,
      predictedFreeSpaces: headline.freeSpaces,
      predictedOccupiedPercent:
        totalSpaces > 0 ? 100 - (headline.freeSpaces / totalSpaces) * 100 : 0,
      freeSpacesBand: [headline.freeLo, headline.freeHi],
      horizons,
      series,
      minutesUntilFull,
      accuracy: {
        maeSpaces: chosen.mae,
        naiveMaeSpaces: naive.mae,
        skill: method === "trend" ? skill : 0,
        // 0 when the sample is too small to trust, so the UI says so.
        backtestCount: haveBacktest ? chosen.n : 0,
      },
    },
  };
}
