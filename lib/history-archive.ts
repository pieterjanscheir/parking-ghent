import { z } from "zod";
import type { ArchiveStore } from "./archive-store";
import type { Parking } from "./parkings.schema";

// Our own record of how full the garages were.
//
// The city only publishes the last ~3 hours, and only for some garages. A
// scheduled job (app/api/cron/snapshot, see vercel.json) saves the live counts
// every 10 minutes, so that over time we can answer "how full is this garage
// usually on a Saturday afternoon?". History can't be collected afterwards,
// which is why this stores the raw readings and leaves the analysis for later.
//
// Layout: one text file per UTC day, one snapshot per line (JSON Lines):
//
//   history/v1/2026/2026-11-19.jsonl
//   {"t":1795089535,"g":{"parking-reep":{"f":212,"c":455,"u":1795089383,"o":1}, …}}
//
// Short keys because each day's file is read and rewritten ~144 times.

export const SNAPSHOT_INTERVAL_MS = 10 * 60_000;

const ROOT = "history/v1";

const ReadingSchema = z.object({
  // Free spaces, or null when the feed had no live count for this garage.
  f: z.number().nullable(),
  // Capacity: total number of spaces.
  c: z.number(),
  // When the feed says this count was last updated (epoch seconds), or null.
  // Kept so a frozen feed can be recognised and left out of later analysis.
  u: z.number().nullable(),
  // 1 when the garage was open, 0 when closed (hours or temporarily).
  o: z.union([z.literal(0), z.literal(1)]),
});

const SnapshotSchema = z.object({
  // When we took the snapshot (epoch seconds).
  t: z.number(),
  // Readings by garage id (the same id as in /parkings/<id>).
  g: z.record(z.string(), ReadingSchema),
});

export type GarageReading = z.infer<typeof ReadingSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;

const toSeconds = (ms: number) => Math.floor(ms / 1000);

export function snapshotOf(parkings: Parking[], now: number): Snapshot {
  const g: Record<string, GarageReading> = {};
  for (const p of parkings) {
    g[p.id] = {
      f: p.hasLiveData ? p.freeSpaces : null,
      c: p.totalSpaces,
      u: p.lastUpdatedAt === null ? null : toSeconds(p.lastUpdatedAt),
      o: p.isOpen ? 1 : 0,
    };
  }
  return { t: toSeconds(now), g };
}

// "2026-11-19" — the UTC day a moment falls on.
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayFile(day: string): string {
  return `${ROOT}/${day.slice(0, 4)}/${day}.jsonl`;
}

// Snapshots in the same 10-minute slot count as the same snapshot.
function slotOf(snapshot: Snapshot): number {
  return Math.floor((snapshot.t * 1000) / SNAPSHOT_INTERVAL_MS);
}

function parseLine(line: string): Snapshot | null {
  try {
    const parsed = SnapshotSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Every readable snapshot in a day's file, oldest first. A damaged line is
// skipped rather than making the whole day unreadable.
export function parseDay(text: string): Snapshot[] {
  const snapshots: Snapshot[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const snapshot = parseLine(line);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}

// The day's file with `snapshot` added — or null when its 10-minute slot is
// already there. Scheduled jobs are occasionally delivered twice, and the job
// can be run by hand; neither should produce duplicate lines.
export function appendSnapshot(dayText: string | null, snapshot: Snapshot): string | null {
  const existing = dayText ?? "";
  // The last *readable* snapshot decides: a damaged final line must not make
  // a repeated run look like a new slot.
  const last = parseDay(existing).at(-1);
  if (last && slotOf(last) >= slotOf(snapshot)) return null;
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  return `${existing}${separator}${JSON.stringify(snapshot)}\n`;
}

export type RecordResult = {
  // "duplicate": this 10-minute slot was already saved; nothing was written.
  status: "saved" | "duplicate";
  file: string;
  // ISO time of the snapshot.
  at: string;
  garages: number;
  // How many of them had a live count.
  withLiveCount: number;
};

export async function recordSnapshot(
  store: ArchiveStore,
  parkings: Parking[],
  now: number,
): Promise<RecordResult> {
  const snapshot = snapshotOf(parkings, now);
  const readings = Object.values(snapshot.g);
  // An empty feed is a broken feed, not a moment with zero garages.
  if (readings.length === 0) throw new Error("The feed returned no garages");

  const file = dayFile(dayKey(now));
  const summary = {
    file,
    at: new Date(snapshot.t * 1000).toISOString(),
    garages: readings.length,
    withLiveCount: readings.filter((r) => r.f !== null).length,
  };

  // Read, add our line, write back — and if the file changed in between
  // (another run got there first), start over once from the new contents.
  for (let attempt = 0; ; attempt++) {
    const current = await store.read(file);
    const next = appendSnapshot(current?.text ?? null, snapshot);
    if (next === null) return { status: "duplicate", ...summary };
    try {
      await store.write(file, next, current?.version ?? null);
      return { status: "saved", ...summary };
    } catch (err) {
      if (attempt >= 1) throw err;
    }
  }
}

// The snapshots saved for one UTC day ("2026-11-19"); empty when none.
export async function readDay(store: ArchiveStore, day: string): Promise<Snapshot[]> {
  const stored = await store.read(dayFile(day));
  return stored ? parseDay(stored.text) : [];
}
