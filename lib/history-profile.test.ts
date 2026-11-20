import { describe, expect, it } from "vitest";
import { memoryStore } from "./archive-store";
import { dayFile, dayKey, type Snapshot } from "./history-archive";
import {
  SLOT_COUNT,
  buildProfile,
  ghentHour,
  parseProfile,
  quietAndBusy,
  slotOf,
  typicalAt,
  typicalDay,
} from "./history-profile";
import { PROFILE_FILE, isProfileRun, readProfile, rebuildProfile } from "./history-profile-store";

// Thursday 19 November 2026, 18:00 in Ghent (17:00 UTC).
const THU_18 = Date.UTC(2026, 10, 19, 17, 0);
const WEEK = 7 * 24 * 60 * 60_000;
const MIN = 60_000;

const snap = (ms: number, free: number | null, over: Partial<Snapshot["g"][string]> = {}): Snapshot => ({
  t: Math.floor(ms / 1000),
  g: { reep: { f: free, c: 455, u: Math.floor(ms / 1000) - 60, o: 1, ...over } },
});

describe("ghentHour", () => {
  it("uses the clocks in Ghent, in winter and in summer", () => {
    expect(ghentHour(THU_18)).toEqual({ weekday: 3, hour: 18, date: "2026-11-19" });
    // 22:30 UTC on a Sunday in July is already Monday 00:30 in Ghent.
    expect(ghentHour(Date.UTC(2026, 6, 5, 22, 30))).toEqual({ weekday: 0, hour: 0, date: "2026-07-06" });
  });
});

describe("buildProfile", () => {
  it("averages an hour's readings into one value per day", () => {
    const profile = buildProfile([snap(THU_18, 200), snap(THU_18 + 10 * MIN, 220), snap(THU_18 + 50 * MIN, 240)], THU_18);
    expect(typicalAt(profile, "reep", 3, 18)).toEqual({ hour: 18, free: 220, days: 1 });
    expect(profile.garages.reep.f).toHaveLength(SLOT_COUNT);
    expect(profile.garages.reep.c).toBe(455);
    expect(profile).toMatchObject({ v: 1, from: "2026-11-19", to: "2026-11-19" });
  });

  it("takes the median over the days, so one unusual day doesn't shift it", () => {
    const snapshots = [
      snap(THU_18 - 2 * WEEK, 210),
      snap(THU_18 - WEEK, 5), // a concert night
      snap(THU_18, 230),
    ];
    expect(typicalAt(buildProfile(snapshots, THU_18), "reep", 3, 18)).toEqual({ hour: 18, free: 210, days: 3 });
  });

  it("keeps weekdays and hours apart", () => {
    const profile = buildProfile([snap(THU_18, 200), snap(THU_18 + 60 * MIN, 150), snap(THU_18 + 24 * 60 * MIN, 90)], THU_18);
    expect(typicalAt(profile, "reep", 3, 18)?.free).toBe(200);
    expect(typicalAt(profile, "reep", 3, 19)?.free).toBe(150);
    expect(typicalAt(profile, "reep", 4, 18)?.free).toBe(90);
    expect(typicalAt(profile, "reep", 5, 18)).toBeNull();
    expect(typicalDay(profile, "reep", 3).map((h) => h.hour)).toEqual([18, 19]);
  });

  it("leaves out readings that aren't measurements", () => {
    const frozen = Math.floor(THU_18 / 1000) - 45 * 60;
    const snapshots = [
      snap(THU_18, null), // no live count
      snap(THU_18 + 10 * MIN, 400, { o: 0 }), // closed
      snap(THU_18 + 20 * MIN, 12, { u: frozen }), // the feed stopped updating
      snap(THU_18 + 30 * MIN, 180, { u: null }), // no update time: taken as is
    ];
    expect(typicalAt(buildProfile(snapshots, THU_18), "reep", 3, 18)).toEqual({ hour: 18, free: 180, days: 1 });
  });

  it("never gives more free spaces than the garage has when its capacity changes", () => {
    // B-Park Gent Sint-Pieters on 19–20 November 2026: the feed's capacity
    // was at least 963 in the evening and 400 the next morning. Measured as
    // shares, the evening's 963 of 1,000 free is "96 % free", 385 of 400.
    const pieters = (ms: number, f: number, c: number): Snapshot => ({
      t: Math.floor(ms / 1000),
      g: { gentstpieters: { f, c, u: null, o: 1 } },
    });
    const profile = buildProfile(
      [pieters(THU_18 + 4 * 60 * MIN, 963, 1000), pieters(THU_18 + 7 * WEEK + 4 * 60 * MIN, 373, 400)],
      THU_18 + 7 * WEEK + 5 * 60 * MIN,
    );
    expect(profile.garages.gentstpieters.c).toBe(400);
    // Thursday 22:00 in Ghent: the median of 96.3 % and 93.25 % free.
    expect(typicalAt(profile, "gentstpieters", 3, 22)?.free).toBe(Math.round(((0.963 + 0.9325) / 2) * 400));
    const most = Math.max(...profile.garages.gentstpieters.f.map((f) => f ?? 0));
    expect(most).toBeLessThanOrEqual(400);
  });

  it("caps a pattern built before that at the garage's capacity", () => {
    const old = buildProfile([snap(THU_18, 200)], THU_18);
    old.garages.reep.f[slotOf(3, 18)] = 963;
    expect(typicalAt(old, "reep", 3, 18)?.free).toBe(455);
  });

  it("is empty without snapshots", () => {
    expect(buildProfile([], THU_18)).toEqual({ v: 1, builtAt: Math.floor(THU_18 / 1000), from: null, to: null, garages: {} });
  });
});

describe("parseProfile", () => {
  it("reads back what was built and rejects anything else", () => {
    const profile = buildProfile([snap(THU_18, 200)], THU_18);
    expect(parseProfile(JSON.stringify(profile))).toEqual(profile);
    expect(parseProfile("{oops")).toBeNull();
    expect(parseProfile(JSON.stringify({ ...profile, v: 2 }))).toBeNull();
    expect(parseProfile(JSON.stringify({ ...profile, garages: { reep: { c: 1, f: [1], n: [1] } } }))).toBeNull();
  });
});

describe("quietAndBusy", () => {
  const hours = (values: Record<number, number>) =>
    Object.entries(values).map(([hour, free]) => ({ hour: Number(hour), free, days: 2 }));

  it("finds the daytime hours with the most and the least room", () => {
    const result = quietAndBusy(hours({ 4: 450, 9: 300, 14: 120, 18: 40, 21: 260 }));
    expect(result?.quietest.hour).toBe(9);
    expect(result?.busiest.hour).toBe(18);
  });

  it("says nothing with too little to go on", () => {
    expect(quietAndBusy(hours({ 3: 450, 9: 300, 14: 120 }))).toBeNull();
    expect(quietAndBusy(hours({ 9: 200, 10: 200, 11: 200 }))).toBeNull();
    expect(quietAndBusy([])).toBeNull();
  });
});

describe("isProfileRun", () => {
  it("is the first run of the UTC day, and the one at 03:00", () => {
    const midnight = Date.UTC(2026, 10, 20);
    expect(isProfileRun(midnight + 20_000)).toBe(true);
    expect(isProfileRun(midnight + 9 * MIN)).toBe(true);
    expect(isProfileRun(midnight + 10 * MIN)).toBe(false);
    expect(isProfileRun(midnight + 180 * MIN)).toBe(true);
    expect(isProfileRun(midnight + 190 * MIN)).toBe(false);
    expect(isProfileRun(THU_18)).toBe(false);
  });
});

describe("rebuildProfile", () => {
  it("builds the pattern from the last four weeks of day files and replaces the old one", async () => {
    const store = memoryStore();
    const line = (ms: number, free: number) => `${JSON.stringify(snap(ms, free))}\n`;
    store.files.set(dayFile(dayKey(THU_18)), line(THU_18, 230));
    store.files.set(dayFile(dayKey(THU_18 - WEEK)), line(THU_18 - WEEK, 210));
    // Exactly four weeks back still counts: at midnight today's own file is
    // empty, and this is the fourth full day of its weekday. That Thursday
    // was still summer time, so 18:00 in Ghent was an hour earlier in UTC.
    const fourWeeksAgo = THU_18 - 4 * WEEK - 60 * MIN;
    store.files.set(dayFile(dayKey(fourWeeksAgo)), line(fourWeeksAgo, 190));
    // Five weeks back: too old to count.
    store.files.set(dayFile(dayKey(THU_18 - 5 * WEEK)), line(THU_18 - 5 * WEEK, 1));
    store.files.set(PROFILE_FILE, "an older pattern");

    // Run later that same Thursday (23:00 UTC): today plus the 28 days before.
    expect(await rebuildProfile(store, THU_18 + 6 * 60 * MIN)).toEqual({ days: 3, garages: 1 });
    const profile = await readProfile(store);
    // The median of 190, 210 and 230.
    expect(typicalAt(profile, "reep", 3, 18)).toEqual({ hour: 18, free: 210, days: 3 });
    expect(profile?.garages.reep.n[slotOf(3, 18)]).toBe(3);
  });

  it("gives no pattern when nothing was stored", async () => {
    expect(await readProfile(memoryStore())).toBeNull();
  });
});
