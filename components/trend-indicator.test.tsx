// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Trend, TrendDirection } from "@/lib/parking-history";
import { TrendIndicator } from "./trend-indicator";

function makeTrend(direction: TrendDirection, predictedFreeSpaces: number): Trend {
  return {
    direction,
    slopePerHour: 0,
    slopeStdErr: 0,
    tStatistic: 0,
    confidence: "medium",
    freeSpacesDelta: 0,
    windowMinutes: 60,
    sampleCount: 12,
    forecast: {
      horizonMinutes: 30,
      atTimestamp: 0,
      predictedFreeSpaces,
      predictedOccupiedPercent: 50,
      freeSpacesBand: [predictedFreeSpaces, predictedFreeSpaces],
      series: [],
    },
  } as Trend;
}

describe("TrendIndicator", () => {
  afterEach(cleanup);

  it.each([
    ["rising", 90, "Filling up. About 10 fewer spaces in the next 30 min"],
    ["falling", 101, "Emptying out. About 1 more space in the next 30 min"],
    ["steady", 100, "Holding steady. No clear change in the next 30 min"],
    ["rising", 100, "Filling up. Slowly filling up over the next 30 min"],
    ["falling", 100, "Emptying out. Slowly emptying over the next 30 min"],
  ] as const)(
    "%s trend predicting %i free (from 100) is labelled correctly",
    (direction, predicted, label) => {
      render(
        <TrendIndicator
          trend={makeTrend(direction, predicted)}
          currentFree={100}
        />,
      );
      expect(screen.getByRole("img", { name: label })).toBeTruthy();
    },
  );
});
