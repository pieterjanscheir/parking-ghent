import { z } from "zod";
import type { Snapshot } from "./history-archive";
import { wallClockToEpoch } from "./zoned-time";

// How full each garage was, day by day, over months: a few numbers per
// garage per day in Ghent, worked out from our own archive
// (lib/history-archive.ts). "On Saturday 12 December Vrijdagmarkt was 98 %
// full at 15:20, 71 % on average during the day, and full for 2 h 10 min."
//
// The weekly pattern (lib/history-profile.ts) only looks at the last four
// weeks. This one keeps every day: the nightly run summarises the days it
// has just read and adds them to the days summarised before, so a day stays
// here long after its file has dropped out of those four weeks.
//
// This file is the arithmetic only, safe to use in the browser. Reading the
// archive and storing the result lives in lib/history-summary-store.ts.

// The readings are taken every 10 minutes, so each one stands for 10 minutes.
export const READING_MINUTES = 10;

// The same limits the live pages use: under 5 % free is "full", under 20 %
// "almost full" (bucketFor in lib/parkings.schema.ts).
const FULL_SHARE = 0.05;
const TIGHT_SHARE = 0.2;

// The daily average only looks at the hours people park in, the same hours
// as "most room / busiest" in the weekly pattern: every garage is empty at
// 04:00, and averaging the night in would make every day look quiet.
export const DAYTIME = { from: 7, to: 22 };

// A count that hasn't been updated for this long is a frozen feed, not a
// measurement (the same limit the live pages and the weekly pattern use).
const FROZEN_AFTER_S = 30 * 60;

// A day with more than two hours without a count is shown as partial: the
// day still in progress when the summary was made, the evening the archive
// started, or a day the feed or the scheduled job was down for a while.
const MISSING_ALLOWED = (2 * 60) / READING_MINUTES;

// One garage on one day, as a short list of numbers to keep the file small
// (a year of 15 garages is about 200 KB):
//
//   [n, c, lo, at, avg, full, tight]
//
// n      readings the day is based on (open, with a current count)
// c      capacity at the busiest reading
// lo     fewest free spaces: the free spaces at the busiest reading
// at     when that was, Ghent clock time as minutes after midnight (860 = 14:20)
// avg    average share occupied between 07:00 and 23:00, in % (null: no
//        daytime readings)
// full   readings with less than 5 % free (×10 = minutes full)
// tight  readings with less than 20 % free, the full ones included
//
// "Busiest" is the reading with the largest share occupied, each reading
// measured against its own capacity: some garages report a capacity that
// changes during the day (see lib/history-profile.ts), and a share is the
// only measure that stays comparable.
const DayStatsSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().positive(),
  z.number().nonnegative(),
  z.number().int().min(0).max(24 * 60 - 1),
  z.number().min(0).max(100).nullable(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SummarySchema = z.object({
  v: z.literal(1),
  // When it was last added to (epoch seconds).
  builtAt: z.number(),
  // First and last day with readings, as dates in Ghent ("2026-11-19").
  from: z.string().regex(DATE).nullable(),
  to: z.string().regex(DATE).nullable(),
  // Garage id → Ghent date → that day's numbers.
  garages: z.record(z.string(), z.record(z.string().regex(DATE), DayStatsSchema)),
});

export type Summary = z.infer<typeof SummarySchema>;
export type DayStats = z.infer<typeof DayStatsSchema>;

const ghentClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// The Ghent date and clock time of a moment: the days follow people's days
// there, not UTC.
export function ghentDay(ms: number): { date: string; minute: number } {
  const parts = ghentClock.formatToParts(ms);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// "2026-11-19" → "2026-11-20", by the calendar (no time zone involved).
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 24 * 60 * 60_000).toISOString().slice(0, 10);
}

// How many readings a full day in Ghent has: 144, but 138 on the day the
// clocks go forward and 150 on the day they go back.
export function readingsInDay(date: string): number {
  const start = wallClockToEpoch(`${date}T00:00:00`, "Europe/Brussels");
  const end = wallClockToEpoch(`${nextDate(date)}T00:00:00`, "Europe/Brussels");
  if (start === null || end === null) return (24 * 60) / READING_MINUTES;
  return Math.round((end - start) / (READING_MINUTES * 60_000));
}

// Too many readings missing to call it a full day: still in progress, or
// with gaps. Such a day is shown as partial, never as a quiet day.
export function isPartial(date: string, stats: DayStats): boolean {
  return stats[0] < readingsInDay(date) - MISSING_ALLOWED;
}

type Tally = {
  n: number;
  busiest: { share: number; free: number; capacity: number; minute: number; t: number } | null;
  daytimeSum: number;
  daytimeCount: number;
  full: number;
  tight: number;
};

// Works out the days in a set of snapshots. Days on or before `skipThrough`
// are left out: the files read start at midnight UTC, which is already 01:00
// (02:00 in summer) in Ghent, so the first Ghent day in them is missing its
// first hour or two and would overwrite a complete earlier summary of it.
export function summariseSnapshots(
  snapshots: Snapshot[],
  now: number,
  skipThrough: string | null = null,
): Summary {
  // garage → Ghent date → running totals.
  const tallies = new Map<string, Map<string, Tally>>();
  for (const snapshot of snapshots) {
    const { date, minute } = ghentDay(snapshot.t * 1000);
    if (skipThrough !== null && date <= skipThrough) continue;
    for (const [id, reading] of Object.entries(snapshot.g)) {
      // No count, a closed garage, or a count the feed stopped updating.
      if (reading.f === null || reading.o === 0 || reading.c <= 0) continue;
      if (reading.u !== null && snapshot.t - reading.u > FROZEN_AFTER_S) continue;
      let days = tallies.get(id);
      if (!days) tallies.set(id, (days = new Map()));
      let tally = days.get(date);
      if (!tally) {
        tally = { n: 0, busiest: null, daytimeSum: 0, daytimeCount: 0, full: 0, tight: 0 };
        days.set(date, tally);
      }
      // The feed is capped at the capacity when it is read
      // (lib/parkings.schema.ts); this keeps older or hand-made files honest.
      const free = Math.min(reading.f, reading.c);
      const freeShare = free / reading.c;
      const share = 1 - freeShare;
      tally.n++;
      // The first moment of the day's peak, whatever order the files were
      // read in (the nightly run reads the newest first).
      const best = tally.busiest;
      if (!best || share > best.share || (share === best.share && snapshot.t < best.t)) {
        tally.busiest = { share, free, capacity: reading.c, minute, t: snapshot.t };
      }
      const hour = Math.floor(minute / 60);
      if (hour >= DAYTIME.from && hour <= DAYTIME.to) {
        tally.daytimeSum += share;
        tally.daytimeCount++;
      }
      if (freeShare < FULL_SHARE) tally.full++;
      if (freeShare < TIGHT_SHARE) tally.tight++;
    }
  }

  const garages: Summary["garages"] = {};
  let from: string | null = null;
  let to: string | null = null;
  for (const [id, days] of tallies) {
    const out: Record<string, DayStats> = {};
    for (const [date, tally] of [...days].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const busiest = tally.busiest!;
      out[date] = [
        tally.n,
        busiest.capacity,
        busiest.free,
        busiest.minute,
        tally.daytimeCount > 0 ? Math.round((tally.daytimeSum / tally.daytimeCount) * 100) : null,
        tally.full,
        tally.tight,
      ];
      if (from === null || date < from) from = date;
      if (to === null || date > to) to = date;
    }
    garages[id] = out;
  }
  return { v: 1, builtAt: Math.floor(now / 1000), from, to, garages };
}

// Adds freshly worked-out days to the summary kept so far. Every day in
// `fresh` replaces that day for all garages (the new one is based on at
// least as many readings); every other day is kept as it was. Running it
// twice on the same files changes nothing but `builtAt`.
export function mergeSummaries(kept: Summary | null, fresh: Summary): Summary {
  if (!kept) return fresh;
  const freshDates = new Set<string>();
  for (const days of Object.values(fresh.garages)) {
    for (const date of Object.keys(days)) freshDates.add(date);
  }
  const ids = new Set([...Object.keys(kept.garages), ...Object.keys(fresh.garages)]);
  const garages: Summary["garages"] = {};
  for (const id of [...ids].sort()) {
    const days: Record<string, DayStats> = {};
    for (const [date, stats] of Object.entries(kept.garages[id] ?? {})) {
      if (!freshDates.has(date)) days[date] = stats;
    }
    Object.assign(days, fresh.garages[id] ?? {});
    const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (Object.keys(sorted).length > 0) garages[id] = sorted;
  }
  const earliest = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a < b ? a : b);
  const latest = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a > b ? a : b);
  return {
    v: 1,
    builtAt: Math.max(kept.builtAt, fresh.builtAt),
    from: earliest(kept.from, fresh.from),
    to: latest(kept.to, fresh.to),
    garages,
  };
}

export function parseSummary(text: string): Summary | null {
  try {
    const parsed = SummarySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// --- Reading it back, for the chart -----------------------------------------

export type GarageDays = {
  // First day this garage was measured.
  from: string;
  // When the summary was last added to (epoch seconds).
  builtAt: number;
  days: Record<string, DayStats>;
};

export const GarageDaysSchema = z.object({
  from: z.string().regex(DATE),
  builtAt: z.number(),
  days: z.record(z.string().regex(DATE), DayStatsSchema),
});

// One garage's days, or null when it was never measured.
export function garageDays(summary: Summary | null, garageId: string): GarageDays | null {
  const days = summary?.garages[garageId];
  const dates = days ? Object.keys(days).sort() : [];
  if (!summary || !days || dates.length === 0) return null;
  return { from: dates[0], builtAt: summary.builtAt, days };
}

export type ChartDay = {
  date: string;
  // null on a day without any reading.
  peak: number | null;
  average: number | null;
  stats: DayStats | null;
  partial: boolean;
};

// Share occupied at the busiest moment, in %.
export const peakPercent = (stats: DayStats) => Math.round((1 - stats[2] / stats[1]) * 100);

// Every day of the last `length` days up to and including `today`, with or
// without readings, so a gap shows as a gap.
export function chartDays(days: Record<string, DayStats>, today: string, length: number): ChartDay[] {
  const out: ChartDay[] = [];
  let date = today;
  for (let i = 0; i < length; i++) {
    const stats = days[date] ?? null;
    out.push({
      date,
      peak: stats ? peakPercent(stats) : null,
      average: stats ? stats[4] : null,
      stats,
      partial: stats ? isPartial(date, stats) : false,
    });
    date = new Date(Date.parse(`${date}T12:00:00Z`) - 24 * 60 * 60_000).toISOString().slice(0, 10);
  }
  return out.reverse();
}

export type RangeFacts = {
  // Days with a full day of readings.
  complete: number;
  // Of those, days on which the garage was full at some point.
  fullDays: number;
  // Minutes full, over the complete days.
  fullMinutes: number;
  // The complete day with the highest peak (the first of equals).
  busiest: ChartDay | null;
  // Average of the daily daytime averages, in %.
  average: number | null;
};

// What a range of days says in words. Partial days are left out, so a day
// cut short by a gap never counts as quiet.
export function rangeFacts(days: ChartDay[]): RangeFacts {
  const complete = days.filter((day) => day.stats && !day.partial);
  let busiest: ChartDay | null = null;
  for (const day of complete) {
    if (!busiest || (day.peak ?? 0) > (busiest.peak ?? 0)) busiest = day;
  }
  const averages = complete.map((day) => day.average).filter((value): value is number => value !== null);
  return {
    complete: complete.length,
    fullDays: complete.filter((day) => day.stats![5] > 0).length,
    fullMinutes: complete.reduce((sum, day) => sum + day.stats![5] * READING_MINUTES, 0),
    busiest,
    average:
      averages.length > 0 ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length) : null,
  };
}

// Complete days measured so far: the chart is shown from a week on.
export const ENOUGH_DAYS = 7;

export function completeDays(days: Record<string, DayStats>): number {
  return Object.entries(days).filter(([date, stats]) => !isPartial(date, stats)).length;
}
