import { describe, expect, it } from "vitest";
import { memoryStore, type ArchiveStore } from "./archive-store";
import {
  appendSnapshot,
  dayFile,
  dayKey,
  parseDay,
  readDay,
  recordSnapshot,
  snapshotOf,
  type Snapshot,
} from "./history-archive";
import type { Parking } from "./parkings.schema";

const NOON = Date.UTC(2026, 10, 19, 12, 0, 4);
const MINUTE = 60_000;

function parking(overrides: Partial<Parking> = {}): Parking {
  return {
    id: "parking-reep",
    name: "Reep",
    description: "",
    openingHours: "",
    websiteUrl: "",
    operator: "",
    type: "carPark",
    typeLabel: "Indoor garage",
    category: "",
    categoryLabel: "",
    isInsideLez: true,
    isOpen: true,
    isTemporaryClosed: false,
    totalSpaces: 449,
    freeSpaces: 120,
    occupiedPercent: 73,
    freePercent: 27,
    hasLiveData: true,
    bucket: "available",
    address: "",
    lat: null,
    lng: null,
    phone: null,
    lastUpdatedAt: NOON - MINUTE,
    isFree: false,
    parkAndRide: false,
    evChargers: 0,
    evMaxKw: null,
    note: null,
    ...overrides,
  };
}

const snapshotAt = (ms: number): Snapshot => snapshotOf([parking()], ms);

describe("snapshotOf", () => {
  it("keeps the count, capacity, feed time and open state per garage", () => {
    expect(snapshotOf([parking()], NOON)).toEqual({
      t: Math.floor(NOON / 1000),
      g: { "parking-reep": { f: 120, c: 449, u: Math.floor((NOON - MINUTE) / 1000), o: 1 } },
    });
  });

  it("records a missing live count as null, not as zero free spaces", () => {
    const snapshot = snapshotOf(
      [parking({ hasLiveData: false, freeSpaces: 0, lastUpdatedAt: null, isOpen: false })],
      NOON,
    );
    expect(snapshot.g["parking-reep"]).toEqual({ f: null, c: 449, u: null, o: 0 });
  });
});

describe("day files", () => {
  it("groups by UTC day, in a folder per year", () => {
    expect(dayKey(Date.UTC(2026, 10, 19, 23, 59, 59))).toBe("2026-11-19");
    expect(dayKey(Date.UTC(2026, 10, 20, 0, 0, 0))).toBe("2026-11-20");
    expect(dayFile("2026-11-19")).toBe("history/v1/2026/2026-11-19.jsonl");
  });

  it("starts a file with one line", () => {
    const text = appendSnapshot(null, snapshotAt(NOON));
    expect(text).toBe(`${JSON.stringify(snapshotAt(NOON))}\n`);
  });

  it("adds a line for the next 10-minute slot", () => {
    const first = appendSnapshot(null, snapshotAt(NOON))!;
    const second = appendSnapshot(first, snapshotAt(NOON + 10 * MINUTE))!;
    expect(parseDay(second).map((s) => s.t)).toEqual([
      Math.floor(NOON / 1000),
      Math.floor((NOON + 10 * MINUTE) / 1000),
    ]);
  });

  it("refuses a second snapshot in the same slot", () => {
    const first = appendSnapshot(null, snapshotAt(NOON))!;
    expect(appendSnapshot(first, snapshotAt(NOON + 3 * MINUTE))).toBeNull();
  });

  it("refuses a snapshot older than the last one", () => {
    const first = appendSnapshot(null, snapshotAt(NOON))!;
    expect(appendSnapshot(first, snapshotAt(NOON - 30 * MINUTE))).toBeNull();
  });

  it("repairs a file that lost its final line break", () => {
    const first = appendSnapshot(null, snapshotAt(NOON))!.trimEnd();
    const second = appendSnapshot(first, snapshotAt(NOON + 10 * MINUTE))!;
    expect(parseDay(second)).toHaveLength(2);
  });

  it("skips damaged lines instead of losing the day", () => {
    const good = JSON.stringify(snapshotAt(NOON));
    const text = `${good}\n{"t": "yesterday"}\nnot json at all\n\n${good}\n`;
    expect(parseDay(text)).toHaveLength(2);
  });

  it("refuses the same slot again even when the last line is damaged", () => {
    const text = `${JSON.stringify(snapshotAt(NOON))}\n{"t":17635`;
    expect(appendSnapshot(text, snapshotAt(NOON + 3 * MINUTE))).toBeNull();
  });

  it("still appends after a damaged last line", () => {
    const text = `${JSON.stringify(snapshotAt(NOON))}\n{"t":17635`;
    const next = appendSnapshot(text, snapshotAt(NOON + 10 * MINUTE))!;
    expect(parseDay(next)).toHaveLength(2);
  });
});

describe("recordSnapshot", () => {
  it("saves a snapshot and reads it back", async () => {
    const store = memoryStore();
    const result = await recordSnapshot(store, [parking(), parking({ id: "parking-ramen" })], NOON);
    expect(result).toEqual({
      status: "saved",
      file: "history/v1/2026/2026-11-19.jsonl",
      at: "2026-11-19T12:00:04.000Z",
      garages: 2,
      withLiveCount: 2,
    });
    const day = await readDay(store, "2026-11-19");
    expect(Object.keys(day[0].g)).toEqual(["parking-reep", "parking-ramen"]);
  });

  it("does nothing when called twice in the same 10 minutes", async () => {
    const store = memoryStore();
    await recordSnapshot(store, [parking()], NOON);
    const again = await recordSnapshot(store, [parking({ freeSpaces: 5 })], NOON + 2 * MINUTE);
    expect(again.status).toBe("duplicate");
    const day = await readDay(store, "2026-11-19");
    expect(day).toHaveLength(1);
    expect(day[0].g["parking-reep"].f).toBe(120);
  });

  it("builds up a day and starts a new file at midnight UTC", async () => {
    const store = memoryStore();
    const start = Date.UTC(2026, 10, 19, 23, 40, 0);
    for (let i = 0; i < 4; i++) {
      await recordSnapshot(store, [parking()], start + i * 10 * MINUTE);
    }
    expect(await readDay(store, "2026-11-19")).toHaveLength(2);
    expect(await readDay(store, "2026-11-20")).toHaveLength(2);
    expect(await readDay(store, "2026-11-21")).toEqual([]);
  });

  it("counts garages without a live reading", async () => {
    const result = await recordSnapshot(
      memoryStore(),
      [parking(), parking({ id: "parking-loop", hasLiveData: false })],
      NOON,
    );
    expect(result).toMatchObject({ garages: 2, withLiveCount: 1 });
  });

  it("refuses to save an empty feed", async () => {
    const store = memoryStore();
    await expect(recordSnapshot(store, [], NOON)).rejects.toThrow(/no garages/);
    expect(store.files.size).toBe(0);
  });

  it("keeps another run's snapshot when both write at once", async () => {
    // Another run saves the previous slot between our read and our write.
    const store = memoryStore();
    await recordSnapshot(store, [parking()], NOON - 20 * MINUTE);
    let interfered = false;
    const racing: ArchiveStore = {
      read: store.read,
      async write(file, text, expected) {
        if (!interfered) {
          interfered = true;
          await recordSnapshot(store, [parking()], NOON - 10 * MINUTE);
        }
        return store.write(file, text, expected);
      },
    };
    const result = await recordSnapshot(racing, [parking()], NOON);
    expect(result.status).toBe("saved");
    expect(await readDay(store, "2026-11-19")).toHaveLength(3);
  });

  it("gives up after a second failed write", async () => {
    let writes = 0;
    const broken: ArchiveStore = {
      read: async () => null,
      write: async () => {
        writes++;
        throw new Error("storage is down");
      },
    };
    await expect(recordSnapshot(broken, [parking()], NOON)).rejects.toThrow("storage is down");
    expect(writes).toBe(2);
  });
});
