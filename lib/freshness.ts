import type { Parking } from "./parkings.schema";

// Measured on the live feed (Nov 2026): the city-run garages update together
// and their timestamps trail real time by 1–5 minutes; the B-Park garages
// update on their own, slower rhythm and were seen up to ~10 minutes behind.
//
// So one garage has to be well past that before its count gets a warning…
export const GARAGE_STALE_AFTER_MS = 30 * 60_000;
// …while the feed as a whole (its most recently updated garage) is normally
// only a few minutes old, so it can be called stopped much sooner.
export const FEED_STALE_AFTER_MS = 15 * 60_000;

type Timestamped = Pick<Parking, "lastUpdatedAt">;

// How old the garage's count is, or null when the feed gave no usable
// timestamp. Never negative: a feed clock slightly ahead of ours reads as 0.
export function dataAgeMs(p: Timestamped, now: number): number | null {
  if (p.lastUpdatedAt === null) return null;
  return Math.max(0, now - p.lastUpdatedAt);
}

// An unknown timestamp is not treated as stale: we can't tell, and flagging
// every garage whenever the field is missing would be noise.
export function isStale(p: Timestamped, now: number): boolean {
  const age = dataAgeMs(p, now);
  return age !== null && age > GARAGE_STALE_AFTER_MS;
}

// The most recent update across all garages — "when did the feed last move".
export function newestUpdate(parkings: Timestamped[]): number | null {
  let newest: number | null = null;
  for (const p of parkings) {
    if (p.lastUpdatedAt !== null && (newest === null || p.lastUpdatedAt > newest)) {
      newest = p.lastUpdatedAt;
    }
  }
  return newest;
}

// An age broken into the unit a person would say it in. The wording itself
// ("3 min ago", "3 min geleden", …) lives in the message files: see
// `useFormatAge` in components/use-labels.ts.
export type AgeParts =
  | { unit: "now" }
  | { unit: "minutes" | "hours" | "days"; count: number };

export function ageParts(ms: number): AgeParts {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return { unit: "now" };
  if (minutes < 60) return { unit: "minutes", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}
