// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Forecast, Trend, TrendDirection } from "@/lib/forecast";
import { TrendIndicator } from "./trend-indicator";

function makeTrend(
  direction: TrendDirection,
  predictedFreeSpaces: number,
  overrides: Partial<Forecast> = {},
): Trend {
  return {
    direction,
    confidence: "medium",
    freeSpacesDelta: 0,
    windowMinutes: 30,
    sampleCount: 12,
    forecast: {
      method: "trend",
      horizonMinutes: 30,
      atTimestamp: 0,
      predictedFreeSpaces,
      predictedOccupiedPercent: 50,
      freeSpacesBand: [predictedFreeSpaces, predictedFreeSpaces],
      horizons: [],
      series: [],
      minutesUntilFull: null,
      accuracy: { maeSpaces: 0, naiveMaeSpaces: 0, skill: 0, backtestCount: 0 },
      ...overrides,
    },
  };
}

function renderTrend(trend: Trend, currentFree = 100) {
  render(<TrendIndicator trend={trend} currentFree={currentFree} />);
}

describe("TrendIndicator", () => {
  afterEach(cleanup);

  it.each([
    ["rising", 90, "Filling up. About 10 fewer spaces in the next 30 min"],
    ["falling", 101, "Emptying out. About 1 more space in the next 30 min"],
    ["steady", 100, "Holding steady. No clear change in the next 30 min"],
  ] as const)(
    "%s trend predicting %i free (from 100) is labelled correctly",
    (direction, predicted, label) => {
      renderTrend(makeTrend(direction, predicted));
      expect(screen.getByRole("img", { name: label })).toBeTruthy();
    },
  );

  it("warns when the parking is likely to fill up", () => {
    renderTrend(makeTrend("rising", 0, { minutesUntilFull: 25 }));
    expect(
      screen.getByRole("img", {
        name: "Filling up. Likely full in about 25 min",
      }),
    ).toBeTruthy();
  });

  it("refuses to forecast when it falls back to persistence", () => {
    renderTrend(
      makeTrend("steady", 100, { method: "persistence", minutesUntilFull: 10 }),
    );
    expect(
      screen.getByRole("img", {
        name: "Holding steady. Too unpredictable right now to forecast a change",
      }),
    ).toBeTruthy();
  });
});
