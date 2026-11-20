import { describe, expect, it } from "vitest";
import {
  GHENT_TARIFFS,
  bandStayCost,
  formatEuro,
  isBelgianPublicHoliday,
  ladderCost,
  rateColumns,
  stayCost,
  stayCostFor,
  tariffFor,
  weekdayRuns,
  type PaidTariff,
} from "./tariffs";
import { wallClockToEpoch } from "./zoned-time";

// Ghent clock time → moment. 18 November 2026 is a Wednesday.
const at = (text: string) => wallClockToEpoch(text, "Europe/Brussels")!;
const H = 60;

const paid = (id: string) => {
  const tariff = tariffFor(id)!.tariff;
  if (tariff.kind !== "paid") throw new Error(`${id} is free`);
  return tariff as PaidTariff;
};

describe("ladderCost", () => {
  const reepDay = paid("parking-reep").bands.regular;

  it("charges whole slices", () => {
    expect(ladderCost(reepDay, 1)).toBe(150);
    expect(ladderCost(reepDay, 30)).toBe(150);
    expect(ladderCost(reepDay, 31)).toBe(300);
  });

  it("follows the operator's table where it slows down after 7 hours", () => {
    // Reep's page: "Tot 7 uur € 21", "Tot 7 uur 30 minuten € 22".
    expect(ladderCost(reepDay, 7 * H)).toBe(2100);
    expect(ladderCost(reepDay, 7 * H + 1)).toBe(2200);
  });

  it("charges the cap past the end of the table", () => {
    expect(ladderCost(reepDay, 12 * H)).toBe(3100);
  });

  it("works with a price per slice too", () => {
    const kouterDay = paid("p-kouter").bands.day;
    expect(ladderCost(kouterDay, 15)).toBe(70);
    expect(ladderCost(kouterDay, 60)).toBe(280);
    expect(ladderCost(kouterDay, 12 * H)).toBe(2800);
  });
});

describe("stayCost — a city garage in the centre (Reep)", () => {
  const reep = paid("parking-reep");

  it("prices a weekday afternoon at the regular rate", () => {
    expect(stayCost(reep, at("2026-11-18T10:00"), 2 * H)).toBe(600);
  });

  it("prices Saturday daytime at the peak rate", () => {
    expect(stayCost(reep, at("2026-11-21T10:00"), 2 * H)).toBe(800);
  });

  it("uses the newer regulation's Saturday table, not the older page", () => {
    // From 1 October 2026: past 9½ hours the €31 day rate applies.
    expect(stayCost(reep, at("2026-11-21T07:00"), 10 * H)).toBe(3100);
  });

  it("charges the day and the night part of an evening on their own tables", () => {
    // 18:00–19:00 at the day rate (€3), 19:00–20:00 at the night rate (€2).
    expect(stayCost(reep, at("2026-11-18T18:00"), 2 * H)).toBe(500);
  });

  it("caps a night at €9", () => {
    expect(stayCost(reep, at("2026-11-18T20:00"), 10 * H)).toBe(900);
  });

  it("handles a stay that crosses midnight", () => {
    expect(stayCost(reep, at("2026-11-19T23:00"), 2 * H)).toBe(400);
  });

  it("never charges more than the daily maximum for 24 hours", () => {
    // 9 h day (€25) + a night (€9) + 3 h day (€9) = €43, capped at €31.
    expect(stayCost(reep, at("2026-11-18T10:00"), 24 * H)).toBe(3100);
  });

  it("starts counting again after 24 hours", () => {
    expect(stayCost(reep, at("2026-11-18T10:00"), 48 * H)).toBe(6200);
    // Day two: 10:00–11:00 on Friday at the regular rate.
    expect(stayCost(reep, at("2026-11-18T10:00"), 25 * H)).toBe(3100 + 300);
  });

  it("lets you leave within 7 minutes for free, except at Vrijdagmarkt", () => {
    expect(stayCost(reep, at("2026-11-18T10:00"), 5)).toBe(0);
    expect(stayCostFor("parking-vrijdagmarkt", at("2026-11-18T10:00"), 5)).toBe(150);
  });

  it("follows the clock through the change to winter time", () => {
    // Saturday 24 October 2026, 22:00 summer time. The clocks go back at
    // 03:00, so 07:00 on Sunday is 10 hours later, not 9.
    expect(stayCost(reep, at("2026-10-24T22:00"), 10 * H)).toBe(900);
    // One more hour is Sunday daytime, at the regular rate.
    expect(stayCost(reep, at("2026-10-24T22:00"), 11 * H)).toBe(1200);
  });
});

describe("stayCost — the other city garages", () => {
  it("prices Savaan across the morning switch to day rates", () => {
    // 05:00–07:00 at night (€3.40), 07:00–09:00 by day (€5).
    expect(stayCostFor("parking-savaan", at("2026-11-18T05:00"), 4 * H)).toBe(840);
  });

  it("charges Ledeberg's Sunday rate on Sundays and public holidays", () => {
    expect(stayCostFor("parking-ledeberg", at("2026-11-18T10:00"), 2 * H)).toBe(240);
    expect(stayCostFor("parking-ledeberg", at("2026-11-22T10:00"), 2 * H)).toBe(200);
    // 11 November, Armistice Day, is a Wednesday in 2026.
    expect(stayCostFor("parking-ledeberg", at("2026-11-11T10:00"), 2 * H)).toBe(200);
  });

  it("charges Het Getouw at most €8 a day", () => {
    expect(stayCostFor("parking-het-getouw", at("2026-11-18T08:00"), 24 * H)).toBe(800);
  });

  it("uses one table around the clock at The Loop", () => {
    expect(stayCostFor("mobiliteit-loop", at("2026-11-18T22:00"), 3 * H)).toBe(1020);
    // The day rate from 8½ hours.
    expect(stayCostFor("parking-d-op-loop", at("2026-11-18T10:00"), 9 * H)).toBe(1800);
    // Past 24 hours, the extra time at the hourly rates.
    expect(stayCostFor("mobiliteit-loop", at("2026-11-18T10:00"), 25 * H)).toBe(1800 + 360);
  });
});

describe("stayCost — Interparking (Kouter)", () => {
  it("charges €0.70 a quarter by day", () => {
    expect(stayCostFor("p-kouter", at("2026-11-18T10:00"), 60)).toBe(280);
    expect(stayCostFor("p-kouter", at("2026-11-18T10:00"), 50)).toBe(280);
  });

  it("caps an evening at €6", () => {
    expect(stayCostFor("p-kouter", at("2026-11-18T20:00"), 3 * H)).toBe(600);
  });
});

describe("stayCost — free and unknown", () => {
  it("costs nothing at a free Park & Ride", () => {
    expect(stayCostFor("pr-oostakker", at("2026-11-18T10:00"), 8 * H)).toBe(0);
  });

  it("is free at P+R The Loop for up to 72 hours, unknown after", () => {
    expect(stayCostFor("pr-loopexpo", at("2026-11-18T10:00"), 72 * H)).toBe(0);
    expect(stayCostFor("pr-loopexpo", at("2026-11-18T10:00"), 73 * H)).toBeNull();
  });

  it("knows nothing about a car park not in the table", () => {
    expect(stayCostFor("p-zuid", at("2026-11-18T10:00"), 2 * H)).toBeNull();
    expect(stayCostFor("gentstpieters", at("2026-11-18T10:00"), 2 * H)).toBeNull();
  });

  it("refuses nonsense input", () => {
    expect(stayCost(paid("parking-reep"), Number.NaN, 60)).toBeNull();
    expect(stayCost(paid("parking-reep"), at("2026-11-18T10:00"), -5)).toBeNull();
  });
});

describe("the table itself", () => {
  it("names a source and a date for every entry", () => {
    for (const [id, entry] of Object.entries(GHENT_TARIFFS)) {
      expect(entry.sourceUrl, id).toMatch(/^https:\/\//);
      expect(entry.checkedOn, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has tables that never go down and stay under their cap", () => {
    for (const [id, entry] of Object.entries(GHENT_TARIFFS)) {
      if (entry.tariff.kind !== "paid") continue;
      for (const ladder of Object.values(entry.tariff.bands)) {
        const prices = ladder.prices ?? [];
        prices.forEach((price, i) => {
          if (i > 0) expect(price, id).toBeGreaterThanOrEqual(prices[i - 1]);
          expect(price, id).toBeLessThanOrEqual(ladder.cap);
        });
      }
    }
  });
});

describe("isBelgianPublicHoliday", () => {
  it("knows the fixed days and the ones that move with Easter", () => {
    expect(isBelgianPublicHoliday(2026, 7, 21)).toBe(true);
    // Easter 2026 is 5 April: Easter Monday, Ascension Day, Whit Monday.
    expect(isBelgianPublicHoliday(2026, 4, 6)).toBe(true);
    expect(isBelgianPublicHoliday(2026, 5, 14)).toBe(true);
    expect(isBelgianPublicHoliday(2026, 5, 25)).toBe(true);
    // Easter 2027 is 28 March.
    expect(isBelgianPublicHoliday(2027, 3, 29)).toBe(true);
    expect(isBelgianPublicHoliday(2026, 11, 18)).toBe(false);
  });
});

describe("rate table helpers", () => {
  it("groups the weekdays that share a day rate", () => {
    const columns = rateColumns(paid("parking-reep"));
    expect(columns.map((c) => [c.band, c.period, c.weekdays])).toEqual([
      ["regular", "day", [0, 1, 2, 3, 4, 5]],
      ["peak", "day", [6]],
      ["night", "night", []],
    ]);
  });

  it("marks the band that also applies on public holidays", () => {
    const columns = rateColumns(paid("parking-ledeberg"));
    expect(columns.map((c) => [c.band, c.holidays])).toEqual([
      ["day", false],
      ["nightAndSunday", true],
      ["nightAndSunday", false],
    ]);
  });

  it("writes weekdays as runs, Monday first", () => {
    expect(weekdayRuns([0, 1, 2, 3, 4, 5])).toEqual([
      [1, 5],
      [0, 0],
    ]);
    expect(weekdayRuns([6])).toEqual([[6, 6]]);
  });

  it("prices a stay inside one band", () => {
    expect(bandStayCost(paid("parking-reep"), "night", 8 * H)).toBe(900);
  });

  it("formats euros the visitor's way", () => {
    expect(formatEuro(650, "en")).toBe("€6.50");
    expect(formatEuro(650, "nl")).toBe("€ 6,50");
  });
});
