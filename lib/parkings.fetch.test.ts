import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchParkingById,
  fetchParkingDetailById,
  fetchParkings,
  fetchParkingsWithRaw,
  LIVE_TTL_MS,
} from "./parkings";
import { clearCache } from "./ttl-cache";

// ---- fixture builders -------------------------------------------------------

type PrimaryFieldOverrides = {
  name?: string;
  id?: string;
  totalcapacity?: number;
  availablecapacity?: number;
  isopennow?: number;
  temporaryclosed?: number;
  categorie?: string;
  type?: string;
  operatorinformation?: string;
  locationanddimension?: string;
};

function primaryRecord(recordid: string, fields: PrimaryFieldOverrides) {
  return {
    recordid,
    fields: {
      name: fields.name ?? "Sample",
      description: "",
      openingtimesdescription: "",
      urllinkaddress: "",
      freeparking: 0,
      occupation: 0,
      availablecapacity: fields.availablecapacity ?? 0,
      totalcapacity: fields.totalcapacity ?? 100,
      temporaryclosed: fields.temporaryclosed ?? 0,
      isopennow: fields.isopennow ?? 1,
      categorie: fields.categorie ?? "buiten LEZ",
      type: fields.type ?? "carPark",
      operatorinformation: fields.operatorinformation ?? "Mobiliteitsbedrijf",
      occupancytrend: "unknown",
      lastupdate: "",
      id: fields.id ?? "",
      locationanddimension: fields.locationanddimension ?? "",
    },
  };
}

function primaryResponse(records: ReturnType<typeof primaryRecord>[]) {
  return { nhits: records.length, records };
}

function locationRecord(
  recordid: string,
  fields: { naam: string; straatnaam: string; huisnr?: string },
) {
  return { recordid, fields };
}

function locationsResponse(records: ReturnType<typeof locationRecord>[]) {
  return { nhits: records.length, records };
}

// ---- fetch router -----------------------------------------------------------

type Handler = () => { status: number; body: unknown };

let routes: Map<string, Handler>;

function mockFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) {
        const { status, body } = handler();
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("no route matched: " + url, { status: 599 });
  }));
}

function route(pattern: string, handler: Handler) {
  routes.set(pattern, handler);
}

function ok(body: unknown): Handler {
  return () => ({ status: 200, body });
}

function fail(status = 500): Handler {
  return () => ({ status, body: { error: "boom" } });
}

function callsTo(pattern: string): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([input]) => String(input).includes(pattern)).length;
}

beforeEach(() => {
  routes = new Map();
  clearCache();
  mockFetch();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- tests ------------------------------------------------------------------

const LIVE = "dataset=bezetting-parkeergarages-real-time";
const LOCATIONS = "dataset=locaties-openbare-parkings-gent";

describe("fetchParkings — happy path", () => {
  it("returns the live feed's parkings sorted by name", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
      primaryRecord("p2", { name: "Dampoort", id: "https://example.com/parkings/parking-dampoort" }),
    ])));
    route(LOCATIONS, ok(locationsResponse([])));

    const parkings = await fetchParkings();

    expect(parkings.map((p) => p.id)).toEqual(["parking-dampoort", "parking-tolhuis"]);
  });

  it("only calls the two feeds it needs", async () => {
    route(LIVE, ok(primaryResponse([])));
    route(LOCATIONS, ok(locationsResponse([])));

    await fetchParkings();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(fetch).mock.calls) {
      // No API keys in the URL, and nothing outside the open-data portal.
      expect(String(input)).toMatch(/^https:\/\/gent\.opendatasoft\.com\//);
      expect(String(input)).not.toMatch(/apikey/i);
    }
  });
});

describe("fetchParkings — graceful degradation", () => {
  it("still returns parkings (with empty addresses) when locations feed fails", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis" }),
    ])));
    route(LOCATIONS, fail());

    const parkings = await fetchParkings();
    expect(parkings).toHaveLength(1);
    expect(parkings[0].address).toBe("");
  });

  it("throws when the live feed fails — the page can't render without it", async () => {
    route(LIVE, fail(502));
    route(LOCATIONS, ok(locationsResponse([])));

    await expect(fetchParkings()).rejects.toThrow();
  });
});

describe("fetchParkings — caching", () => {
  it("shares one upstream call between concurrent requests", async () => {
    route(LIVE, ok(primaryResponse([primaryRecord("p1", { name: "Tolhuis" })])));
    route(LOCATIONS, ok(locationsResponse([])));

    const results = await Promise.all([fetchParkings(), fetchParkings(), fetchParkings()]);

    expect(results.every((r) => r.length === 1)).toBe(true);
    expect(callsTo(LIVE)).toBe(1);
    expect(callsTo(LOCATIONS)).toBe(1);
  });

  it("reuses the live feed within its TTL and refetches once it expires", async () => {
    vi.useFakeTimers();
    let free = 10;
    route(LIVE, () => ({
      status: 200,
      body: primaryResponse([primaryRecord("p1", { name: "Tolhuis", availablecapacity: free })]),
    }));
    route(LOCATIONS, ok(locationsResponse([])));

    expect((await fetchParkings())[0].freeSpaces).toBe(10);

    free = 7;
    vi.advanceTimersByTime(LIVE_TTL_MS - 1);
    expect((await fetchParkings())[0].freeSpaces).toBe(10);
    expect(callsTo(LIVE)).toBe(1);

    // Strict TTL: once expired, the caller waits for fresh data rather than
    // being handed the old count.
    vi.advanceTimersByTime(1);
    expect((await fetchParkings())[0].freeSpaces).toBe(7);
    expect(callsTo(LIVE)).toBe(2);
  });

  it("fetches the static address list once, not once per live refresh", async () => {
    vi.useFakeTimers();
    route(LIVE, ok(primaryResponse([primaryRecord("p1", { name: "Tolhuis" })])));
    route(LOCATIONS, ok(locationsResponse([])));

    await fetchParkings();
    vi.advanceTimersByTime(LIVE_TTL_MS * 10);
    await fetchParkings();

    expect(callsTo(LIVE)).toBe(2);
    expect(callsTo(LOCATIONS)).toBe(1);
  });

  it("keeps the last good address list when a later refresh of it fails", async () => {
    vi.useFakeTimers();
    route(LIVE, ok(primaryResponse([primaryRecord("p1", { name: "Dampoort" })])));
    route(LOCATIONS, ok(locationsResponse([
      locationRecord("l1", { naam: "Dampoort", straatnaam: "Koopvaardijlaan", huisnr: "5" }),
    ])));
    expect((await fetchParkings())[0].address).toBe("Koopvaardijlaan 5");

    route(LOCATIONS, fail(503));
    vi.advanceTimersByTime(25 * 60 * 60_000);

    expect((await fetchParkings())[0].address).toBe("Koopvaardijlaan 5");
    expect(callsTo(LOCATIONS)).toBe(2);
  });

  it("does not serve an old live count when the live feed goes down", async () => {
    vi.useFakeTimers();
    route(LIVE, ok(primaryResponse([primaryRecord("p1", { name: "Tolhuis" })])));
    route(LOCATIONS, ok(locationsResponse([])));
    await fetchParkings();

    route(LIVE, fail(503));
    vi.advanceTimersByTime(LIVE_TTL_MS);

    await expect(fetchParkings()).rejects.toThrow();
  });

  it("remembers a failure briefly instead of hammering a feed that is down", async () => {
    vi.useFakeTimers();
    route(LIVE, fail(503));
    route(LOCATIONS, ok(locationsResponse([])));

    await expect(fetchParkings()).rejects.toThrow();
    await expect(fetchParkings()).rejects.toThrow();
    expect(callsTo(LIVE)).toBe(1);

    // …but recovers quickly once the feed is back.
    route(LIVE, ok(primaryResponse([primaryRecord("p1", { name: "Tolhuis" })])));
    vi.advanceTimersByTime(5_000);
    expect(await fetchParkings()).toHaveLength(1);
  });
});

describe("fetchParkings — address enrichment", () => {
  it("fills empty addresses from the locations dataset using name-key matching", async () => {
    route(LIVE, ok(primaryResponse([
      // No locationanddimension → empty address from normalization.
      primaryRecord("p1", { name: "B-Park Dampoort" }),
      primaryRecord("p2", { name: "Het Getouw" }),
    ])));
    // Locations dataset uses bare names — normalizeNameKey strips "b-park"
    // and "het" prefixes so they match.
    route(LOCATIONS, ok(locationsResponse([
      locationRecord("l1", { naam: "Dampoort", straatnaam: "Koopvaardijlaan", huisnr: "5" }),
      locationRecord("l2", { naam: "Getouw", straatnaam: "Wiedauwkaai" }),
    ])));

    const parkings = await fetchParkings();
    const dampoort = parkings.find((p) => p.name === "B-Park Dampoort")!;
    const getouw = parkings.find((p) => p.name === "Het Getouw")!;
    expect(dampoort.address).toBe("Koopvaardijlaan 5");
    expect(getouw.address).toBe("Wiedauwkaai");
  });

  it("does not overwrite an address that the live feed already provided", async () => {
    const loc = JSON.stringify({ roadName: "Original Street 9" });
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Dampoort", locationanddimension: loc }),
    ])));
    route(LOCATIONS, ok(locationsResponse([
      locationRecord("l1", { naam: "Dampoort", straatnaam: "Other Street", huisnr: "1" }),
    ])));

    const parkings = await fetchParkings();
    expect(parkings[0].address).toBe("Original Street 9");
  });

  it("uses ADDRESS_OVERRIDES (e.g. 'The Loop') ahead of the locations dataset", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "The Loop" }),
    ])));
    // Even if locations had a different address for "the loop", the override wins.
    route(LOCATIONS, ok(locationsResponse([
      locationRecord("l1", { naam: "The Loop", straatnaam: "Wrong Street" }),
    ])));

    const parkings = await fetchParkings();
    expect(parkings[0].address).toBe("Louis Blériotlaan");
  });

  it("drops conflicting addresses in the locations dataset (multiple straatnamen for the same name-key)", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Ambiguous" }),
    ])));
    route(LOCATIONS, ok(locationsResponse([
      locationRecord("l1", { naam: "Ambiguous", straatnaam: "Street A" }),
      locationRecord("l2", { naam: "Ambiguous", straatnaam: "Street B" }),
    ])));

    const parkings = await fetchParkings();
    // Conflict → key is dropped, so no enrichment happens.
    expect(parkings[0].address).toBe("");
  });
});

describe("fetchParkingsWithRaw", () => {
  it("includes one call record per feed and tags the successful ones", async () => {
    route(LIVE, ok(primaryResponse([])));
    route(LOCATIONS, ok(locationsResponse([])));

    const { calls } = await fetchParkingsWithRaw();
    expect(calls.map((c) => c.id).sort()).toEqual([
      "bezetting-parkeergarages-real-time",
      "locaties-openbare-parkings-gent",
    ]);
    expect(calls.every((c) => c.ok)).toBe(true);
  });

  it("records a failed call with ok=false instead of swallowing it", async () => {
    route(LIVE, ok(primaryResponse([])));
    route(LOCATIONS, fail(503));

    const { calls } = await fetchParkingsWithRaw();
    const locations = calls.find((c) => c.id === "locaties-openbare-parkings-gent");
    expect(locations).toBeDefined();
    expect(locations!.ok).toBe(false);
  });
});

describe("fetchParkingById", () => {
  it("returns the matching parking", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
    ])));
    route(LOCATIONS, ok(locationsResponse([])));

    const found = await fetchParkingById("parking-tolhuis");
    expect(found?.name).toBe("Tolhuis");
  });

  it("returns null when no parking matches", async () => {
    route(LIVE, ok(primaryResponse([])));
    route(LOCATIONS, ok(locationsResponse([])));

    expect(await fetchParkingById("missing")).toBeNull();
  });
});

describe("fetchParkingDetailById", () => {
  it("returns the parking with its raw record and enriched address", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Dampoort", id: "https://example.com/parkings/parking-dampoort" }),
      primaryRecord("p2", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
    ])));
    route(LOCATIONS, ok(locationsResponse([
      locationRecord("l1", { naam: "Tolhuis", straatnaam: "Vrijdagmarkt", huisnr: "1" }),
    ])));

    const detail = await fetchParkingDetailById("parking-tolhuis");
    expect(detail?.parking.name).toBe("Tolhuis");
    expect(detail?.parking.address).toBe("Vrijdagmarkt 1");
    expect(detail?.raw.recordid).toBe("p2");
  });

  it("returns null for an unknown id without any extra upstream call", async () => {
    route(LIVE, ok(primaryResponse([])));
    route(LOCATIONS, ok(locationsResponse([])));

    expect(await fetchParkingDetailById("parking-kouter")).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("shares the overview's upstream calls (page title + page body + list)", async () => {
    route(LIVE, ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
    ])));
    route(LOCATIONS, ok(locationsResponse([])));

    await fetchParkings();
    await fetchParkingById("parking-tolhuis");
    await fetchParkingDetailById("parking-tolhuis");

    expect(callsTo(LIVE)).toBe(1);
    expect(callsTo(LOCATIONS)).toBe(1);
  });
});
