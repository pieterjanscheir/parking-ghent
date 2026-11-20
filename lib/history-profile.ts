import { z } from "zod";
import type { Snapshot } from "./history-archive";

// What a garage usually looks like at a given hour of the week, worked out
// from our own archive (lib/history-archive.ts): "on Thursdays around 18:00
// there are usually about 210 spaces free".
//
// This file is the arithmetic only, safe to use in the browser. Reading the
// archive and storing the result lives in lib/history-profile-store.ts.

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const HOURS = 24;
// One value per hour of the week: Monday 00:00 first, Sunday 23:00 last.
export const SLOT_COUNT = WEEKDAYS.length * HOURS;

// A count that hasn't been updated for this long is a frozen feed, not a
// measurement (the same limit the live pages use for "stale").
const FROZEN_AFTER_S = 30 * 60;

const GarageProfileSchema = z.object({
  // Capacity at the most recent reading.
  c: z.number(),
  // Free spaces usually seen in each hour of the week, or null without data.
  f: z.array(z.number().nullable()).length(SLOT_COUNT),
  // How many different days each of those is based on.
  n: z.array(z.number()).length(SLOT_COUNT),
});

export const ProfileSchema = z.object({
  v: z.literal(1),
  // When it was worked out (epoch seconds).
  builtAt: z.number(),
  // First and last day with readings, as dates in Ghent ("2026-11-19").
  from: z.string().nullable(),
  to: z.string().nullable(),
  garages: z.record(z.string(), GarageProfileSchema),
});

export type Profile = z.infer<typeof ProfileSchema>;

const ghentParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Where a moment falls in the week, by the clocks in Ghent: the patterns
// follow people's days there, not UTC.
export function ghentHour(ms: number): { weekday: number; hour: number; date: string } {
  const parts = ghentParts.formatToParts(ms);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    hour: Number(get("hour")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export const slotOf = (weekday: number, hour: number) => weekday * HOURS + hour;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Works the pattern out from raw snapshots. Each day counts once per hour
// (the average of that hour's readings), and the usual value is the median
// over the days: one football night doesn't shift "a typical Thursday".
//
// The arithmetic is done on the share of the garage that is free, each
// reading against its own capacity, and only turned into spaces at the end,
// against the latest capacity. Some garages report a capacity that changes:
// in November 2026 B-Park Gent Sint-Pieters had at least 963 spaces one
// evening and 400 the next morning, B-Park Dampoort 90 at night and 120 the
// next day. The median of the counts themselves mixed those and gave
// "usually 963 free" of 400.
export function buildProfile(snapshots: Snapshot[], now: number): Profile {
  // garage → slot → Ghent date → that hour's free shares (0–1).
  const readings = new Map<string, Map<number, Map<string, number[]>>>();
  const capacity = new Map<string, { at: number; c: number }>();
  let from: string | null = null;
  let to: string | null = null;

  for (const snapshot of snapshots) {
    const { weekday, hour, date } = ghentHour(snapshot.t * 1000);
    const slot = slotOf(weekday, hour);
    for (const [id, reading] of Object.entries(snapshot.g)) {
      // No count, a closed garage, or a count the feed stopped updating.
      if (reading.f === null || reading.o === 0 || reading.c <= 0) continue;
      if (reading.u !== null && snapshot.t - reading.u > FROZEN_AFTER_S) continue;
      let slots = readings.get(id);
      if (!slots) readings.set(id, (slots = new Map()));
      let days = slots.get(slot);
      if (!days) slots.set(slot, (days = new Map()));
      const share = Math.min(reading.f, reading.c) / reading.c;
      const values = days.get(date);
      if (values) values.push(share);
      else days.set(date, [share]);
      const known = capacity.get(id);
      if (!known || snapshot.t >= known.at) capacity.set(id, { at: snapshot.t, c: reading.c });
      if (from === null || date < from) from = date;
      if (to === null || date > to) to = date;
    }
  }

  const garages: Profile["garages"] = {};
  for (const [id, slots] of readings) {
    const c = capacity.get(id)?.c ?? 0;
    const f: (number | null)[] = Array(SLOT_COUNT).fill(null);
    const n: number[] = Array(SLOT_COUNT).fill(0);
    for (const [slot, days] of slots) {
      const dayAverages = [...days.values()].map(
        (values) => values.reduce((sum, value) => sum + value, 0) / values.length,
      );
      f[slot] = Math.round(median(dayAverages) * c);
      n[slot] = dayAverages.length;
    }
    garages[id] = { c, f, n };
  }
  return { v: 1, builtAt: Math.floor(now / 1000), from, to, garages };
}

export function parseProfile(text: string): Profile | null {
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type Typical = {
  hour: number;
  // Free spaces usually seen in this hour.
  free: number;
  // How many different days that is based on.
  days: number;
};

export function typicalAt(
  profile: Profile | null,
  garageId: string,
  weekday: number,
  hour: number,
): Typical | null {
  const garage = profile?.garages[garageId];
  const slot = slotOf(weekday, hour);
  const free = garage?.f[slot] ?? null;
  if (!garage || free === null) return null;
  // A pattern built before the shares above could hold more free spaces
  // than the garage has; never pass that on.
  return { hour, free: garage.c > 0 ? Math.min(free, garage.c) : free, days: garage.n[slot] };
}

// The hours of one day of the week that have data, in order.
export function typicalDay(profile: Profile | null, garageId: string, weekday: number): Typical[] {
  const hours: Typical[] = [];
  for (let hour = 0; hour < HOURS; hour++) {
    const typical = typicalAt(profile, garageId, weekday, hour);
    if (typical) hours.push(typical);
  }
  return hours;
}

// The hours when people actually park: a garage is always empty at 04:00,
// which is no help to anyone choosing when to come.
const DAYTIME = { from: 7, to: 22 };

// When a day usually has the most and the least room, among daytime hours.
// null with fewer than three such hours: no pattern to speak of yet.
export function quietAndBusy(hours: Typical[]): { quietest: Typical; busiest: Typical } | null {
  const daytime = hours.filter((h) => h.hour >= DAYTIME.from && h.hour <= DAYTIME.to);
  if (daytime.length < 3) return null;
  let quietest = daytime[0];
  let busiest = daytime[0];
  for (const hour of daytime) {
    if (hour.free > quietest.free) quietest = hour;
    if (hour.free < busiest.free) busiest = hour;
  }
  return quietest.free === busiest.free ? null : { quietest, busiest };
}
