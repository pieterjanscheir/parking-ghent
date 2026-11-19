import { describe, expect, it } from "vitest";
import { banDateParts, bansUrl, clockDate, ghentClock, parseBans } from "./parking-bans";

const SPOT = { lat: 51.045912, lng: 3.730712 };
// Thursday 19 November 2026, 15:04 in Ghent (winter time, UTC+1).
const NOW = Date.UTC(2026, 10, 19, 14, 4);

const record = (over: Record<string, unknown> = {}) => ({
  sdatum: "24/11/2026",
  startuur: "07:00",
  edatum: "24/12/2026",
  einduur: "17:00",
  type: "werfwagen",
  geo_point_2d: { lon: 3.7307528, lat: 51.0458699 },
  ...over,
});

describe("bansUrl", () => {
  it("asks for the bans within 75 m of the spot, and nothing more", () => {
    const url = new URL(bansUrl(SPOT));
    expect(url.origin).toBe("https://gent.opendatasoft.com");
    expect(url.pathname).toContain("/gegunde-parkeerverboden-gent/records");
    expect(url.searchParams.get("where")).toBe(
      "within_distance(geo_point_2d, geom'POINT(3.73071 51.04591)', 75m)",
    );
    expect([...url.searchParams.keys()].sort()).toEqual(["limit", "select", "where"]);
  });
});

describe("ghentClock", () => {
  it("gives the local time in Ghent, in winter and in summer", () => {
    expect(ghentClock(NOW)).toBe("2026-11-19T15:04");
    expect(ghentClock(Date.UTC(2026, 6, 1, 22, 30))).toBe("2026-07-02T00:30");
  });
});

describe("parseBans", () => {
  it("reads a ban that starts within the coming week", () => {
    expect(parseBans({ results: [record()] }, SPOT, NOW)).toEqual([
      { from: "2026-11-24T07:00", until: "2026-12-24T17:00", kind: "construction", active: false, metres: 10 },
    ]);
  });

  it("marks a ban that is running as in force", () => {
    const [ban] = parseBans({ results: [record({ sdatum: "18/11/2026" })] }, SPOT, NOW);
    expect(ban.active).toBe(true);
  });

  it("leaves out bans that are over or more than a week away", () => {
    const results = [
      record({ sdatum: "01/11/2026", edatum: "19/11/2026", einduur: "15:00" }),
      record({ sdatum: "27/11/2026", startuur: "08:00" }),
      record({ sdatum: "01/12/2026" }),
    ];
    expect(parseBans({ results }, SPOT, NOW)).toEqual([]);
  });

  it("keeps a ban that ends later today", () => {
    const results = [record({ sdatum: "19/11/2026", edatum: "19/11/2026", einduur: "18:00" })];
    expect(parseBans({ results }, SPOT, NOW)).toHaveLength(1);
  });

  it("tells the kinds of ban apart", () => {
    const results = [
      record({ type: "laden en lossen" }),
      record({ type: "werfwagen" }),
      record({ type: "E3 - stilstaan- en parkeerverbod" }),
      record({ type: null }),
    ];
    expect(parseBans({ results }, SPOT, NOW).map((ban) => ban.kind)).toEqual([
      "loading",
      "construction",
      "noParking",
      "noParking",
    ]);
  });

  it("covers the whole day when the hours are missing", () => {
    const [ban] = parseBans({ results: [record({ startuur: null, einduur: "" })] }, SPOT, NOW);
    expect(ban).toMatchObject({ from: "2026-11-24T00:00", until: "2026-12-24T23:59" });
  });

  it("puts the nearest first, then the soonest, and stops at five", () => {
    const far = { lon: 3.7313, lat: 51.0462 };
    const results = [
      record({ sdatum: "20/11/2026", geo_point_2d: far }),
      record({ sdatum: "25/11/2026" }),
      record({ sdatum: "20/11/2026" }),
      ...Array.from({ length: 5 }, () => record({ sdatum: "26/11/2026", geo_point_2d: far })),
    ];
    const bans = parseBans({ results }, SPOT, NOW);
    expect(bans).toHaveLength(5);
    expect(bans.slice(0, 3).map((ban) => [ban.from.slice(0, 10), ban.metres])).toEqual([
      ["2026-11-20", 10],
      ["2026-11-25", 10],
      ["2026-11-20", 50],
    ]);
  });

  it("skips records it cannot read", () => {
    const results = [
      record({ sdatum: "2026-11-24" }),
      record({ edatum: null }),
      record({ geo_point_2d: null }),
      record({ sdatum: "24/12/2026", edatum: "24/11/2026" }),
      "junk",
      null,
    ];
    expect(parseBans({ results }, SPOT, NOW)).toEqual([]);
    expect(parseBans({ error_code: "ODSQLError" }, SPOT, NOW)).toEqual([]);
    expect(parseBans(null, SPOT, NOW)).toEqual([]);
  });
});

describe("banDateParts", () => {
  it("prints only the time for an end on the same day", () => {
    const ban = { from: "2026-11-21T07:00", until: "2026-11-21T17:00" };
    expect(banDateParts(ban, NOW)).toEqual({ untilTimeOnly: true, fromYear: false, untilYear: false });
  });

  it("adds the year where it isn't this year", () => {
    const ban = { from: "2026-08-03T00:00", until: "2027-05-28T23:59" };
    expect(banDateParts(ban, NOW)).toEqual({ untilTimeOnly: false, fromYear: false, untilYear: true });
  });
});

describe("clockDate", () => {
  it("keeps the clock numbers when formatted as UTC", () => {
    const text = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(clockDate("2026-11-24T07:00"));
    expect(text).toContain("24 Nov");
    expect(text).toContain("07:00");
  });
});
