import { getArchiveStore, type ArchiveStore } from "./archive-store";
import { dayFile, dayKey, parseDay } from "./history-archive";
import type { RecentDays } from "./history-profile-store";
import { mergeSummaries, parseSummary, summariseSnapshots, type Summary } from "./history-summary";
import { cached } from "./ttl-cache";

// Keeping the long-term summary (lib/history-summary.ts) next to the archive
// it is made from.
//
// The nightly run already reads the last 29 day files for the weekly pattern
// (lib/history-profile-store.ts). The summary is made from those same
// snapshots, so all it adds is one read and one write of its own file.
// Pages only ever read that file.

export const SUMMARY_FILE = "history/v1/daily.json";

// The first day of the archive on parking.scheir.eu. A rebuild from scratch
// starts here; an earlier file that doesn't exist only costs a read that
// finds nothing, so a self-hosted archive that started later works as is.
export const ARCHIVE_START = "2026-11-19";

const DAY_MS = 24 * 60 * 60_000;
// Files read at once by a rebuild: the same number the nightly run reads.
const CHUNK_DAYS = 29;

const previousDay = (day: string) => dayKey(Date.parse(`${day}T00:00:00Z`) - DAY_MS);

async function readKept(store: ArchiveStore) {
  const stored = await store.read(SUMMARY_FILE);
  if (!stored) return { summary: null, version: null };
  const summary = parseSummary(stored.text);
  // Never replace a summary we can't read: it holds days whose files are no
  // longer read every night, and a fresh one would silently drop them. A
  // rebuild (?summary=1) is the way out.
  if (!summary) throw new Error(`${SUMMARY_FILE} could not be read; rebuild it with ?summary=1`);
  return { summary, version: stored.version };
}

export type SummaryResult = { dates: number; garages: number; from: string | null; to: string | null };

const resultOf = (summary: Summary, dates: number): SummaryResult => ({
  dates,
  garages: Object.keys(summary.garages).length,
  from: summary.from,
  to: summary.to,
});

const datesIn = (summary: Summary) =>
  new Set(Object.values(summary.garages).flatMap((days) => Object.keys(days))).size;

// The nightly update: the days in the files just read are (re)worked out and
// added to what was kept. The oldest file starts at midnight UTC, which is
// already past midnight in Ghent, so that Ghent day is left as it was.
export async function updateSummary(store: ArchiveStore, recent: RecentDays, now: number): Promise<SummaryResult> {
  const oldest = recent.days.at(-1) ?? null;
  const fresh = summariseSnapshots(recent.snapshots, now, oldest);
  // Read, merge, write — and if another run wrote in between, once more
  // from its version. Merging is idempotent, so that is always safe.
  for (let attempt = 0; ; attempt++) {
    const kept = await readKept(store);
    const merged = mergeSummaries(kept.summary, fresh);
    try {
      await store.write(SUMMARY_FILE, JSON.stringify(merged), kept.version);
      return resultOf(merged, datesIn(fresh));
    } catch (err) {
      if (attempt >= 1) throw err;
    }
  }
}

// From scratch, from every day file since `from`: for the first time, and
// after a change to how the summary is calculated. Works through the archive
// four weeks at a time so a year of files is never in memory at once; each
// stretch starts one file early, for the first hour of its first Ghent day.
export async function rebuildSummary(
  store: ArchiveStore,
  now: number,
  from: string = ARCHIVE_START,
): Promise<SummaryResult & { files: number }> {
  const today = dayKey(now);
  let summary: Summary = { v: 1, builtAt: Math.floor(now / 1000), from: null, to: null, garages: {} };
  let files = 0;
  for (let start = from; start <= today; ) {
    const days = [previousDay(start)];
    while (days.length < CHUNK_DAYS && days.at(-1)! < today) days.push(dayKey(Date.parse(`${days.at(-1)}T00:00:00Z`) + DAY_MS));
    const read = await Promise.all(days.map((day) => store.read(dayFile(day))));
    files += read.filter((file) => file !== null).length;
    const snapshots = read.flatMap((file) => (file ? parseDay(file.text) : []));
    summary = mergeSummaries(summary, summariseSnapshots(snapshots, now, days[0]));
    // The last file's evening belongs to the next Ghent day, which the next
    // stretch works out in full.
    start = dayKey(Date.parse(`${days.at(-1)}T00:00:00Z`) + DAY_MS);
  }
  const existing = await store.read(SUMMARY_FILE);
  await store.write(SUMMARY_FILE, JSON.stringify(summary), existing?.version ?? null);
  return { ...resultOf(summary, datesIn(summary)), files };
}

export async function readSummary(store: ArchiveStore): Promise<Summary | null> {
  const stored = await store.read(SUMMARY_FILE);
  return stored ? parseSummary(stored.text) : null;
}

// The summary for pages and the API: null when there is no archive or no
// summary yet. It changes once a night, so one read per server instance
// every few hours is plenty.
export function fetchSummary(): Promise<Summary | null> {
  return cached(
    "history-summary",
    { ttlMs: 3 * 60 * 60_000, errorTtlMs: 10 * 60_000, staleIfError: true },
    async () => {
      const store = getArchiveStore();
      return store ? readSummary(store) : null;
    },
  );
}
