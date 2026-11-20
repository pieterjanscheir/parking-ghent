import { describe, expect, it } from "vitest";
import { memoryStore } from "./archive-store";
import { dayFile, dayKey, type Snapshot } from "./history-archive";
import { readRecentDays } from "./history-profile-store";
import {
  chartDays,
  completeDays,
  garageDays,
  ghentDay,
  isPartial,
  mergeSummaries,
  parseSummary,
  rangeFacts,
  readingsInDay,
  summariseSnapshots,
  type Summary,
} from "./history-summary";
import { SUMMARY_FILE, readSummary, rebuildSummary, updateSummary } from "./history-summary-store";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
// Friday 20 November 2026, 00:00 in Ghent (23:00 UTC the day before).
const FRI = Date.UTC(2026, 10, 19, 23, 0);

// Vrijdagmarkt, as the feed gave it on 20 November 2026 (602 spaces).
const reading = (ms: number, free: number | null, over: Partial<Snapshot["g"][string]> = {}) => ({
  f: free,
  c: 602,
  u: Math.floor(ms / 1000) - 60,
  o: 1 as const,
  ...over,
});
const snap = (ms: number, free: number | null, over: Partial<Snapshot["g"][string]> = {}): Snapshot => ({
  t: Math.floor(ms / 1000),
  g: { "parking-vrijdagmarkt": reading(ms, free, over) },
});

// A whole Ghent day of readings every 10 minutes, starting at local midnight.
function fullDay(start: number, freeAt: (minute: number) => number): Snapshot[] {
  return Array.from({ length: 144 }, (_, i) => snap(start + i * 10 * MIN, freeAt(i * 10)));
}

// A busy Friday: quiet at night, 15 free at 14:20, otherwise 160 free by day.
const friday = (minute: number) => (minute === 860 ? 15 : minute >= 7 * 60 && minute < 23 * 60 ? 160 : 500);

describe("ghentDay and readingsInDay", () => {
  it("uses the date and clock in Ghent", () => {
    expect(ghentDay(FRI)).toEqual({ date: "2026-11-20", minute: 0 });
    expect(ghentDay(FRI - MIN)).toEqual({ date: "2026-11-19", minute: 23 * 60 + 59 });
    // Summer time: 22:30 UTC is already 00:30 the next day.
    expect(ghentDay(Date.UTC(2026, 6, 5, 22, 30))).toEqual({ date: "2026-07-06", minute: 30 });
  });

  it("knows a day has 144 readings, fewer or more when the clocks change", () => {
    expect(readingsInDay("2026-11-20")).toBe(144);
    expect(readingsInDay("2027-03-28")).toBe(138);
    expect(readingsInDay("2026-10-25")).toBe(150);
  });
});

describe("summariseSnapshots", () => {
  it("keeps the busiest moment, the daytime average and the time full", () => {
    const summary = summariseSnapshots(fullDay(FRI, friday), FRI + DAY);
    const [n, c, lo, at, avg, full, tight] = summary.garages["parking-vrijdagmarkt"]["2026-11-20"];
    expect({ n, c, lo, at }).toEqual({ n: 144, c: 602, lo: 15, at: 860 });
    // 07:00–23:00 is 96 readings: 95 at 160 free and one at 15.
    expect(avg).toBe(Math.round(((95 * (1 - 160 / 602) + (1 - 15 / 602)) / 96) * 100));
    // 15 of 602 is under 5 % free; 160 is not under 20 %.
    expect(full).toBe(1);
    expect(tight).toBe(1);
    expect(summary).toMatchObject({ v: 1, from: "2026-11-20", to: "2026-11-20" });
  });

  it("measures each reading against its own capacity", () => {
    // B-Park Gent Sint-Pieters: at least 963 spaces one evening, 400 the next
    // day. 30 free of 400 is busier than 900 free of 1,000.
    const at = (h: number, f: number, c: number): Snapshot => ({
      t: Math.floor((FRI + h * 60 * MIN) / 1000),
      g: { gentstpieters: { f, c, u: null, o: 1 } },
    });
    const day = summariseSnapshots([at(1, 900, 1000), at(14, 30, 400)], FRI).garages.gentstpieters["2026-11-20"];
    expect(day.slice(1, 4)).toEqual([400, 30, 14 * 60]);
    // Never more free than the garage has, even in a hand-made file.
    const odd = summariseSnapshots([at(14, 450, 400)], FRI).garages.gentstpieters["2026-11-20"];
    expect(odd[2]).toBe(400);
  });

  it("leaves out readings that aren't measurements", () => {
    const frozen = Math.floor(FRI / 1000) - 45 * 60;
    const snapshots = [
      snap(FRI + 9 * 60 * MIN, null), // no live count
      snap(FRI + 10 * 60 * MIN, 0, { o: 0 }), // closed
      snap(FRI + 11 * 60 * MIN, 0, { u: frozen }), // the feed stopped updating
      snap(FRI + 12 * 60 * MIN, 300),
    ];
    const day = summariseSnapshots(snapshots, FRI).garages["parking-vrijdagmarkt"]["2026-11-20"];
    expect(day[0]).toBe(1);
    expect(day[2]).toBe(300);
  });

  it("leaves out the Ghent days it was told to skip", () => {
    const summary = summariseSnapshots([snap(FRI - 60 * MIN, 100), snap(FRI + 60 * MIN, 200)], FRI, "2026-11-19");
    expect(Object.keys(summary.garages["parking-vrijdagmarkt"])).toEqual(["2026-11-20"]);
  });

  it("is empty without snapshots", () => {
    expect(summariseSnapshots([], FRI)).toEqual({ v: 1, builtAt: FRI / 1000, from: null, to: null, garages: {} });
  });
});

describe("partial days", () => {
  it("recognises 19 November 2026, with one reading at 13:00 and then a gap until 19:40 UTC", () => {
    const thu = FRI - DAY;
    const snapshots = [snap(thu + 14 * 60 * MIN, 120)];
    for (let ms = Date.UTC(2026, 10, 19, 19, 40); ms < FRI; ms += 10 * MIN) snapshots.push(snap(ms, 300));
    const day = summariseSnapshots(snapshots, FRI).garages["parking-vrijdagmarkt"]["2026-11-19"];
    expect(day[0]).toBe(21);
    expect(isPartial("2026-11-19", day)).toBe(true);
  });

  it("allows up to two hours of gaps in a day", () => {
    const stats = (n: number) => [n, 602, 100, 600, 50, 0, 0] as Summary["garages"][string][string];
    expect(isPartial("2026-11-20", stats(144))).toBe(false);
    expect(isPartial("2026-11-20", stats(132))).toBe(false);
    expect(isPartial("2026-11-20", stats(131))).toBe(true);
  });
});

describe("mergeSummaries", () => {
  const day1 = summariseSnapshots(fullDay(FRI, friday), FRI + DAY);
  const day2 = summariseSnapshots(fullDay(FRI + DAY, () => 400), FRI + 2 * DAY);

  it("keeps the days summarised before and adds the new ones", () => {
    const merged = mergeSummaries(day1, day2);
    expect(Object.keys(merged.garages["parking-vrijdagmarkt"])).toEqual(["2026-11-20", "2026-11-21"]);
    expect(merged).toMatchObject({ from: "2026-11-20", to: "2026-11-21", builtAt: day2.builtAt });
  });

  it("replaces a day worked out again, for every garage", () => {
    const early = summariseSnapshots(
      [snap(FRI + 60 * MIN, 50), { t: (FRI + 60 * MIN) / 1000, g: { "parking-reep": { f: 1, c: 455, u: null, o: 1 } } }],
      FRI,
    );
    const merged = mergeSummaries(early, day1);
    expect(merged.garages["parking-vrijdagmarkt"]["2026-11-20"]).toEqual(day1.garages["parking-vrijdagmarkt"]["2026-11-20"]);
    expect(merged.garages["parking-reep"]).toBeUndefined();
  });

  it("changes nothing when run twice on the same days", () => {
    const once = mergeSummaries(day1, day2);
    expect(mergeSummaries(once, day2)).toEqual(once);
    expect(mergeSummaries(null, day1)).toEqual(day1);
  });
});

describe("parseSummary", () => {
  it("reads back what was built and rejects anything else", () => {
    const summary = summariseSnapshots(fullDay(FRI, friday), FRI + DAY);
    expect(parseSummary(JSON.stringify(summary))).toEqual(summary);
    expect(parseSummary("{oops")).toBeNull();
    expect(parseSummary(JSON.stringify({ ...summary, v: 2 }))).toBeNull();
    expect(parseSummary(JSON.stringify({ ...summary, garages: { x: { "2026-11-20": [1, 2] } } }))).toBeNull();
  });
});

describe("the chart's days", () => {
  const summary = mergeSummaries(
    summariseSnapshots(fullDay(FRI, friday), FRI + DAY),
    summariseSnapshots([snap(FRI + 2 * DAY + 60 * MIN, 400)], FRI + 2 * DAY + 2 * 60 * MIN),
  );
  const garage = garageDays(summary, "parking-vrijdagmarkt")!;

  it("gives one garage's days, or null for a garage never measured", () => {
    expect(garage).toMatchObject({ from: "2026-11-20", builtAt: summary.builtAt });
    expect(garageDays(summary, "nowhere")).toBeNull();
    expect(garageDays(null, "parking-vrijdagmarkt")).toBeNull();
  });

  it("lists every day of the range, a day without readings as a gap", () => {
    const days = chartDays(garage.days, "2026-11-22", 4);
    expect(days.map((day) => day.date)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(days.map((day) => day.peak)).toEqual([null, Math.round((1 - 15 / 602) * 100), null, Math.round((1 - 400 / 602) * 100)]);
    expect(days.map((day) => day.partial)).toEqual([false, false, false, true]);
  });

  it("describes a range from its complete days only", () => {
    const facts = rangeFacts(chartDays(garage.days, "2026-11-22", 28));
    expect(facts).toMatchObject({ complete: 1, fullDays: 1, fullMinutes: 10 });
    expect(facts.busiest?.date).toBe("2026-11-20");
    expect(completeDays(garage.days)).toBe(1);
  });
});

describe("storing the summary", () => {
  const files = (store: ReturnType<typeof memoryStore>, snapshots: Snapshot[]) => {
    for (const s of snapshots) {
      const file = dayFile(dayKey(s.t * 1000));
      store.files.set(file, `${store.files.get(file) ?? ""}${JSON.stringify(s)}\n`);
    }
  };

  // Six weeks of busy Fridays and quiet other days, 10 November–21 December.
  const start = Date.UTC(2026, 10, 9, 23, 0);
  const sixWeeks = Array.from({ length: 42 }, (_, d) =>
    fullDay(start + d * DAY, (minute) => (d % 7 === 4 ? friday(minute) : 450)),
  ).flat();

  it("keeps days whose files are no longer read every night", async () => {
    const store = memoryStore();
    files(store, sixWeeks);
    // Night of 9 December, then the night of 23 December: the second run
    // reads nothing from November any more.
    for (const night of [Date.UTC(2026, 11, 9, 0, 5), Date.UTC(2026, 11, 23, 0, 5)]) {
      await updateSummary(store, await readRecentDays(store, night), night);
    }
    const days = (await readSummary(store))!.garages["parking-vrijdagmarkt"];
    // The first run read 11 November (UTC) to 9 December. 11 November in
    // Ghent began an hour before that first file, so 12 November is the
    // first day kept.
    expect(Object.keys(days)[0]).toBe("2026-11-12");
    expect(Object.keys(days).at(-1)).toBe("2026-12-21");
    expect(Object.values(days).every((stats) => stats[0] === 144)).toBe(true);
  });

  it("is the same when run twice, and the same as a rebuild from every file", async () => {
    const store = memoryStore();
    files(store, sixWeeks);
    const night = Date.UTC(2026, 11, 22, 0, 5);
    const recent = await readRecentDays(store, night);
    await updateSummary(store, recent, night);
    const once = store.files.get(SUMMARY_FILE);
    await updateSummary(store, recent, night);
    expect(store.files.get(SUMMARY_FILE)).toBe(once);

    const rebuilt = await rebuildSummary(store, night, "2026-11-10");
    expect(rebuilt).toMatchObject({ from: "2026-11-10", to: "2026-12-21", garages: 1, dates: 42 });
    const all = (await readSummary(store))!.garages["parking-vrijdagmarkt"];
    // Rebuilt in stretches of four weeks: no day lost or cut at the seams.
    expect(Object.keys(all)).toHaveLength(42);
    expect(Object.values(all).every((stats) => stats[0] === 144)).toBe(true);
    for (const [date, stats] of Object.entries(JSON.parse(once!).garages["parking-vrijdagmarkt"])) {
      expect(all[date]).toEqual(stats);
    }
  });

  it("refuses to replace a summary it can't read", async () => {
    const store = memoryStore();
    files(store, sixWeeks);
    store.files.set(SUMMARY_FILE, "{damaged");
    const night = Date.UTC(2026, 11, 9, 0, 5);
    await expect(updateSummary(store, await readRecentDays(store, night), night)).rejects.toThrow(/summary=1/);
    expect(store.files.get(SUMMARY_FILE)).toBe("{damaged");
  });

  it("gives no summary when nothing was stored", async () => {
    expect(await readSummary(memoryStore())).toBeNull();
  });
});
