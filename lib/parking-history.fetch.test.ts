import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchParkingHistory, fetchParkingHistoryWithRaw } from "./parking-history";

type Page = {
  total_count: number;
  results: Array<{ datetime: string; availablespaces: number; numberofspaces: number }>;
};

type Handler = (url: URL) => { status: number; body: unknown };

let handler: Handler;

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const { status, body } = handler(url);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  handler = () => ({ status: 599, body: { error: "no handler set" } });
  mockFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function pages(allResults: Page["results"], totalCount = allResults.length) {
  // Slice on offset/limit so each test only declares the "true" full dataset
  // and the mock simulates real Opendatasoft pagination.
  handler = (url) => {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    return {
      status: 200,
      body: {
        total_count: totalCount,
        results: allResults.slice(offset, offset + limit),
      },
    };
  };
}

function point(minutesAgo: number, availablespaces: number, numberofspaces = 200) {
  const ts = Date.UTC(2026, 0, 15, 12, 0, 0) - minutesAgo * 60_000;
  return {
    datetime: new Date(ts).toISOString(),
    availablespaces,
    numberofspaces,
  };
}

describe("fetchParkingHistory — dataset mapping", () => {
  it("returns null for parkings without a known history dataset", async () => {
    const result = await fetchParkingHistory("the-loop");
    expect(result).toBeNull();
  });
});

describe("fetchParkingHistory — single page", () => {
  it("stops after one fetch when results < PAGE_LIMIT", async () => {
    pages([point(20, 50), point(10, 60), point(0, 70)]);
    const result = await fetchParkingHistory("parking-tolhuis");
    expect(result).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns points sorted oldest → newest", async () => {
    pages([point(0, 70), point(20, 50), point(10, 60)]);
    const result = await fetchParkingHistory("parking-tolhuis");
    const tsList = result!.map((p) => p.timestamp);
    expect(tsList).toEqual([...tsList].sort((a, b) => a - b));
  });

  it("returns no entries on an empty feed (rather than null)", async () => {
    pages([]);
    expect(await fetchParkingHistory("parking-tolhuis")).toEqual([]);
  });
});

describe("fetchParkingHistory — pagination", () => {
  it("paginates through multiple pages until results < PAGE_LIMIT", async () => {
    // 250 points → 3 pages: 100 + 100 + 50.
    const all = Array.from({ length: 250 }, (_, i) => point(250 - i, i));
    pages(all);
    const result = await fetchParkingHistory("parking-tolhuis");
    expect(result).toHaveLength(250);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops at MAX_PAGES (20) even if the feed claims more total_count", async () => {
    // Synthetic 2,500-point dataset but the cap is at 20 pages × 100 = 2,000.
    const all = Array.from({ length: 2_500 }, (_, i) => point(2500 - i, i % 100));
    pages(all);
    const result = await fetchParkingHistory("parking-tolhuis");
    expect(result!.length).toBeLessThanOrEqual(2_000);
    expect(fetch).toHaveBeenCalledTimes(20);
  });
});

describe("fetchParkingHistory — data hygiene", () => {
  it("deduplicates by timestamp", async () => {
    const t = point(10, 50);
    pages([t, { ...t, availablespaces: 99 }, point(5, 60)]);
    const result = await fetchParkingHistory("parking-tolhuis");
    expect(result).toHaveLength(2);
  });

  it("clamps free spaces into [0, totalSpaces]", async () => {
    pages([
      // availablespaces > numberofspaces → clamped down.
      point(20, 999, 100),
      // availablespaces < 0 → clamped up to 0.
      point(10, -1, 100),
    ]);
    const result = await fetchParkingHistory("parking-tolhuis");
    expect(result!.map((p) => p.freeSpaces)).toEqual([100, 0]);
  });

  it("derives freePercent/occupiedPercent from clamped values, summing to 100", async () => {
    pages([point(10, 50, 200)]);
    const result = await fetchParkingHistory("parking-tolhuis");
    const p = result![0];
    expect(p.freePercent).toBe(25);
    expect(p.occupiedPercent).toBe(75);
    expect(p.freePercent + p.occupiedPercent).toBe(100);
  });

  it("treats numberofspaces=0 as totalSpaces=1 to avoid div-by-zero", async () => {
    pages([point(10, 0, 0)]);
    const result = await fetchParkingHistory("parking-tolhuis");
    expect(result![0].totalSpaces).toBe(1);
    expect(Number.isFinite(result![0].freePercent)).toBe(true);
  });

  it("throws on a non-OK response", async () => {
    handler = () => ({ status: 502, body: { error: "bad gateway" } });
    await expect(fetchParkingHistory("parking-tolhuis")).rejects.toThrow();
  });
});

describe("fetchParkingHistoryWithRaw — raw call records", () => {
  it("returns null for parkings without a history dataset", async () => {
    expect(await fetchParkingHistoryWithRaw("the-loop")).toBeNull();
  });

  it("records one call per page with the correct offset in the subtitle", async () => {
    const all = Array.from({ length: 250 }, (_, i) => point(250 - i, i));
    pages(all);
    const result = await fetchParkingHistoryWithRaw("parking-tolhuis");
    expect(result?.calls).toHaveLength(3);
    expect(result!.calls[0].subtitle).toContain("offset 0");
    expect(result!.calls[1].subtitle).toContain("offset 100");
    expect(result!.calls[2].subtitle).toContain("offset 200");
    expect(result!.calls.every((c) => c.ok)).toBe(true);
  });
});
