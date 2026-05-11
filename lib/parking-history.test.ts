import { describe, expect, it } from "vitest";
import {
  computeTrend,
  getHistoryDataset,
  parkingsWithHistory,
  type HistoryPoint,
} from "./parking-history";

// Build a synthetic history series with linearly changing occupancy plus a
// small deterministic perturbation. The perturbation matters: a perfectly
// linear series produces ~zero residual variance, which makes the t-statistic
// numerically unstable and ill-defined — exactly the case computeTrend was
// not designed for. Real feed data is always noisy, so noisy fixtures are the
// honest test input.
function series(opts: {
  startOccupied: number;
  endOccupied: number;
  windowMinutes?: number;
  sampleCount?: number;
  totalSpaces?: number;
  endTimestamp?: number;
  noiseAmplitude?: number;
}): HistoryPoint[] {
  const {
    startOccupied,
    endOccupied,
    windowMinutes = 60,
    sampleCount = 13,
    totalSpaces = 200,
    endTimestamp = 1_700_000_000_000,
    noiseAmplitude = 1.5,
  } = opts;
  const startTs = endTimestamp - windowMinutes * 60_000;
  const out: HistoryPoint[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const f = i / (sampleCount - 1);
    // Deterministic ~1.5pp wobble — small relative to the trends we test,
    // large enough to give the WLS fit non-trivial residuals.
    const noise = Math.sin(i * 1.7) * noiseAmplitude;
    const occupied = Math.max(
      0,
      Math.min(100, startOccupied + (endOccupied - startOccupied) * f + noise),
    );
    const freePercent = 100 - occupied;
    const freeSpaces = Math.round((totalSpaces * freePercent) / 100);
    out.push({
      timestamp: startTs + (endTimestamp - startTs) * f,
      isoTime: new Date(startTs + (endTimestamp - startTs) * f).toISOString(),
      freeSpaces,
      totalSpaces,
      occupiedPercent: occupied,
      freePercent,
    });
  }
  return out;
}

describe("computeTrend — insufficient data", () => {
  it("returns null with fewer than 5 points", () => {
    expect(computeTrend(series({ startOccupied: 10, endOccupied: 20, sampleCount: 4 }))).toBeNull();
  });

  it("returns null when the 60-minute window has fewer than 5 samples", () => {
    // 4 samples spread across a 6-hour history → only the most-recent ~1 sample
    // falls inside the 60-minute trend window.
    const sparse: HistoryPoint[] = [];
    const end = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) {
      const ts = end - (3 - i) * 2 * 60 * 60_000; // every 2 hours
      sparse.push({
        timestamp: ts,
        isoTime: new Date(ts).toISOString(),
        freeSpaces: 100,
        totalSpaces: 200,
        occupiedPercent: 50,
        freePercent: 50,
      });
    }
    expect(computeTrend(sparse)).toBeNull();
  });
});

describe("computeTrend — direction detection", () => {
  it("detects a rising trend (occupancy going up = fewer free spaces)", () => {
    const t = computeTrend(series({ startOccupied: 20, endOccupied: 80 }));
    expect(t).not.toBeNull();
    expect(t!.direction).toBe("rising");
    expect(t!.slopePerHour).toBeGreaterThan(0);
    expect(t!.freeSpacesDelta).toBeLessThan(0);
  });

  it("detects a falling trend", () => {
    const t = computeTrend(series({ startOccupied: 80, endOccupied: 20 }));
    expect(t).not.toBeNull();
    expect(t!.direction).toBe("falling");
    expect(t!.slopePerHour).toBeLessThan(0);
    expect(t!.freeSpacesDelta).toBeGreaterThan(0);
  });

  it("calls a flat series 'steady'", () => {
    const t = computeTrend(series({ startOccupied: 50, endOccupied: 50 }));
    expect(t).not.toBeNull();
    expect(t!.direction).toBe("steady");
  });
});

describe("computeTrend — forecast", () => {
  it("projects the 15-minute horizon and keeps free-spaces in [0, total]", () => {
    const total = 200;
    const t = computeTrend(
      series({ startOccupied: 20, endOccupied: 80, totalSpaces: total }),
    )!;
    expect(t.forecast.horizonMinutes).toBe(15);
    expect(t.forecast.series.length).toBeGreaterThan(1);
    for (const point of t.forecast.series) {
      expect(point.freeSpaces).toBeGreaterThanOrEqual(0);
      expect(point.freeSpaces).toBeLessThanOrEqual(total);
      expect(point.freeLo).toBeGreaterThanOrEqual(0);
      expect(point.freeHi).toBeLessThanOrEqual(total);
      expect(point.freeLo).toBeLessThanOrEqual(point.freeHi);
    }
  });

  it("predicts more occupied than now when occupancy is rising", () => {
    const t = computeTrend(series({ startOccupied: 20, endOccupied: 80 }))!;
    const newest = t.forecast.series[0];
    const horizon = t.forecast.series[t.forecast.series.length - 1];
    expect(horizon.freeSpaces).toBeLessThanOrEqual(newest.freeSpaces);
    expect(t.forecast.predictedOccupiedPercent).toBeGreaterThanOrEqual(80);
  });

  it("predicts fewer occupied than now when occupancy is falling", () => {
    const t = computeTrend(series({ startOccupied: 80, endOccupied: 20 }))!;
    const newest = t.forecast.series[0];
    const horizon = t.forecast.series[t.forecast.series.length - 1];
    expect(horizon.freeSpaces).toBeGreaterThanOrEqual(newest.freeSpaces);
  });
});

describe("computeTrend — robustness", () => {
  it("does not blow up on duplicate / non-monotonic timestamps", () => {
    const base = series({ startOccupied: 30, endOccupied: 70 });
    // computeTrend trusts the caller; just verify it tolerates equal x's
    // without producing NaN/infinite output.
    const dup = [...base, { ...base[base.length - 1] }];
    const t = computeTrend(dup)!;
    expect(Number.isFinite(t.slopePerHour)).toBe(true);
    expect(Number.isFinite(t.tStatistic)).toBe(true);
  });

  it("handles totalSpaces=0 in the newest point without dividing by zero", () => {
    const points = series({ startOccupied: 50, endOccupied: 60 });
    points[points.length - 1].totalSpaces = 0;
    const t = computeTrend(points)!;
    // The forecast clamps to [0, totalSpaces=0], so every predicted free-spaces
    // count must be 0 — the important thing is no NaN/Infinity leaks through.
    for (const point of t.forecast.series) {
      expect(point.freeSpaces).toBe(0);
      expect(point.freeLo).toBe(0);
      expect(point.freeHi).toBe(0);
    }
  });
});

describe("getHistoryDataset / parkingsWithHistory", () => {
  it("returns null for unknown ids", () => {
    expect(getHistoryDataset("not-a-parking")).toBeNull();
  });

  it("returns a dataset slug for known ids", () => {
    expect(getHistoryDataset("parking-tolhuis")).toBe(
      "recente-bezetting-parking-tolhuis-gent",
    );
  });

  it("lists every id that has a dataset mapping", () => {
    const ids = parkingsWithHistory();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getHistoryDataset(id)).not.toBeNull();
    }
  });
});
