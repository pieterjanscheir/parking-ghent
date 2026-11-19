import { getArchiveStore, type ArchiveStore } from "./archive-store";
import { dayFile, dayKey, parseDay } from "./history-archive";
import { buildProfile, parseProfile, type Profile } from "./history-profile";
import { cached } from "./ttl-cache";

// Keeping the weekly pattern (lib/history-profile.ts) next to the archive it
// is made from.
//
// Working it out means reading four weeks of day files. Doing that on a page
// view would be slow and would cost a storage read per file per visitor, so
// the scheduled job that already runs every 10 minutes does it once a night
// and saves the result as one small file. Pages only ever read that file.

export const PROFILE_FILE = "history/v1/profile.json";
// Four weeks: enough days per weekday for a median, recent enough to follow
// the seasons.
export const PROFILE_DAYS = 28;
const DAY_MS = 24 * 60 * 60_000;

// The job runs every 10 minutes; the pattern is rebuilt on the first run of
// the (UTC) day, and once more at 03:00 in case that run was missed.
export function isProfileRun(now: number): boolean {
  const minuteOfDay = Math.floor((now % DAY_MS) / 60_000);
  return minuteOfDay < 10 || (minuteOfDay >= 180 && minuteOfDay < 190);
}

export async function rebuildProfile(
  store: ArchiveStore,
  now: number,
): Promise<{ days: number; garages: number }> {
  // Today's file is only partly filled (at midnight it is empty), so four
  // full weeks reach one file further back: today plus the 28 days before.
  const days = Array.from({ length: PROFILE_DAYS + 1 }, (_, back) => dayKey(now - back * DAY_MS));
  const files = await Promise.all(days.map((day) => store.read(dayFile(day))));
  const snapshots = files.flatMap((file) => (file ? parseDay(file.text) : []));
  const profile = buildProfile(snapshots, now);
  // Replace whatever is there: the pattern is derived data, and a second run
  // writing at the same moment would have written the same thing.
  const existing = await store.read(PROFILE_FILE);
  await store.write(PROFILE_FILE, JSON.stringify(profile), existing?.version ?? null);
  return {
    days: files.filter((file) => file !== null).length,
    garages: Object.keys(profile.garages).length,
  };
}

export async function readProfile(store: ArchiveStore): Promise<Profile | null> {
  const stored = await store.read(PROFILE_FILE);
  return stored ? parseProfile(stored.text) : null;
}

// The pattern for pages and the API: null when there is no archive or no
// pattern yet. It changes once a night, so one read per server instance
// every few hours is plenty.
export function fetchProfile(): Promise<Profile | null> {
  return cached(
    "history-profile",
    { ttlMs: 3 * 60 * 60_000, errorTtlMs: 10 * 60_000, staleIfError: true },
    async () => {
      const store = getArchiveStore();
      return store ? readProfile(store) : null;
    },
  );
}
