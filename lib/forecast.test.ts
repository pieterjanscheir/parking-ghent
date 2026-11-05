import { describe, expect, it } from "vitest";
import { computeTrend, predictedChange, recentSlope } from "./forecast";
import type { HistoryPoint } from "./parking-history";

const END = 1_700_000_000_000;

// Minute-level series (like the real feed) where free spaces follow `f(min)`
// plus a small deterministic wobble, so fits have non-trivial residuals.
function series(
  f: (minutesFromStart: number) => number,
  opts: { minutes?: number; totalSpaces?: number; noise?: number } = {},
): HistoryPoint[] {
  const { minutes = 180, totalSpaces = 400, noise = 1 } = opts;
  const out: HistoryPoint[] = [];
  for (let m = 0; m <= minutes; m++) {
    const ts = END - (minutes - m) * 60_000;
    const free = Math.max(
      0,
      Math.min(totalSpaces, Math.round(f(m) + Math.sin(m * 1.7) * noise)),
    );
    const freePercent = totalSpaces > 0 ? (free / totalSpaces) * 100 : 0;
    out.push({
      timestamp: ts,
      isoTime: new Date(ts).toISOString(),
      freeSpaces: free,
      totalSpaces,
      occupiedPercent: 100 - freePercent,
      freePercent,
    });
  }
  return out;
}

describe("recentSlope / predictedChange", () => {
  it("recovers the slope of a linear series", () => {
    const pts = series((m) => 300 - m, { noise: 0 });
    expect(recentSlope(pts)).toBeCloseTo(-1, 5);
  });

  it("saturates instead of growing linearly", () => {
    const at15 = predictedChange(-1, 15);
    const at60 = predictedChange(-1, 60);
    const at600 = predictedChange(-1, 600);
    expect(at15).toBeLessThan(0);
    expect(Math.abs(at60)).toBeGreaterThan(Math.abs(at15));
    // Never more than K·τ·slope = 0.75·15 = 11.25 spaces.
    expect(Math.abs(at600)).toBeLessThanOrEqual(11.25 + 1e-9);
  });
});

describe("computeTrend — insufficient data", () => {
  it("returns null with fewer than 5 points", () => {
    expect(computeTrend(series(() => 100, { minutes: 3 }))).toBeNull();
  });

  it("returns null when history spans less than the slope window", () => {
    expect(computeTrend(series(() => 100, { minutes: 15 }))).toBeNull();
  });
});

describe("computeTrend — direction", () => {
  it("flags a filling garage as rising occupancy", () => {
    const t = computeTrend(series((m) => 350 - 1.5 * m))!;
    expect(t.direction).toBe("rising");
    expect(t.forecast.method).toBe("trend");
    expect(t.forecast.predictedFreeSpaces).toBeLessThan(t.forecast.series[0].freeSpaces);
    expect(t.freeSpacesDelta).toBeLessThan(0);
  });

  it("flags an emptying garage as falling occupancy", () => {
    const t = computeTrend(series((m) => 50 + 1.5 * m))!;
    expect(t.direction).toBe("falling");
    expect(t.forecast.predictedFreeSpaces).toBeGreaterThan(t.forecast.series[0].freeSpaces);
  });

  it("calls a flat series steady", () => {
    expect(computeTrend(series(() => 200))!.direction).toBe("steady");
  });
});

describe("computeTrend — forecast", () => {
  it("returns 15/30/60 min horizons with a 0–60 min series inside [0, total]", () => {
    const total = 400;
    const t = computeTrend(series((m) => 350 - 1.5 * m, { totalSpaces: total }))!;
    expect(t.forecast.horizons.map((h) => h.minutes)).toEqual([15, 30, 60]);
    expect(t.forecast.series).toHaveLength(13);
    for (const p of t.forecast.series) {
      expect(p.freeLo).toBeGreaterThanOrEqual(0);
      expect(p.freeHi).toBeLessThanOrEqual(total);
      expect(p.freeLo).toBeLessThanOrEqual(p.freeSpaces);
      expect(p.freeSpaces).toBeLessThanOrEqual(p.freeHi);
    }
  });

  it("widens the band with horizon", () => {
    const t = computeTrend(series((m) => 200 + 30 * Math.sin(m / 20), { noise: 3 }))!;
    const widths = t.forecast.series.slice(1).map((p) => p.freeHi - p.freeLo);
    for (let i = 1; i < widths.length; i++) {
      // Allow ±1 for rounding / clamping.
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] - 1);
    }
  });

  it("predicts when a filling garage will be full", () => {
    // 30 free of 400 and dropping 2/min → below 5% (20) within the hour.
    const t = computeTrend(series((m) => 390 - 2 * m, { totalSpaces: 400 }))!;
    expect(t.forecast.minutesUntilFull).not.toBeNull();
    expect(t.forecast.minutesUntilFull!).toBeLessThanOrEqual(60);
  });

  it("does not predict 'full' for a steady garage", () => {
    expect(computeTrend(series(() => 200))!.forecast.minutesUntilFull).toBeNull();
  });

  it("falls back to 'nothing changes' when the trend keeps reversing", () => {
    // Fast zig-zag: the 20-min trend is always pointing the wrong way.
    const t = computeTrend(
      series((m) => 200 + (Math.floor(m / 25) % 2 === 0 ? 1 : -1) * ((m % 25) * 3), { noise: 0 }),
    )!;
    expect(t.forecast.method).toBe("persistence");
    expect(t.direction).toBe("steady");
    expect(t.forecast.accuracy.skill).toBe(0);
  });

  it("reports a positive skill score on a steady trend", () => {
    const t = computeTrend(series((m) => 380 - m))!;
    expect(t.forecast.accuracy.skill).toBeGreaterThan(0);
    expect(t.forecast.accuracy.maeSpaces).toBeLessThan(t.forecast.accuracy.naiveMaeSpaces);
  });
});

describe("computeTrend — robustness", () => {
  it("tolerates duplicate timestamps", () => {
    const base = series((m) => 300 - m);
    const t = computeTrend([...base, { ...base[base.length - 1] }])!;
    expect(Number.isFinite(t.forecast.predictedFreeSpaces)).toBe(true);
  });

  it("handles totalSpaces=0 without NaN", () => {
    const pts = series(() => 0, { totalSpaces: 0 });
    const t = computeTrend(pts)!;
    for (const p of t.forecast.series) {
      expect(p.freeSpaces).toBe(0);
      expect(p.freeLo).toBe(0);
      expect(p.freeHi).toBe(0);
    }
    expect(Number.isFinite(t.forecast.predictedOccupiedPercent)).toBe(true);
  });

  it("tolerates gaps in the feed", () => {
    const pts = series((m) => 300 - m).filter((_, i) => i < 60 || i > 100);
    expect(computeTrend(pts)).not.toBeNull();
  });
});

describe("computeTrend — review fixes", () => {
  it("keeps the trend method when nothing moved (zero baseline error)", () => {
    const t = computeTrend(series(() => 200, { noise: 0 }))!;
    expect(t.forecast.accuracy.naiveMaeSpaces).toBe(0);
    expect(t.forecast.method).toBe("trend");
    expect(t.direction).toBe("steady");
  });

  it("reports backtestCount 0 when the backtest is too small to trust", () => {
    // Just over the 20-min slope window: at most a couple of backtest origins.
    const t = computeTrend(series((m) => 300 - m, { minutes: 24 }))!;
    expect(t.forecast.accuracy.backtestCount).toBe(0);
    expect(t.confidence).toBe("low");
  });
});
