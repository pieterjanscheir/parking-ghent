import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchParkingById,
  fetchParkingDetailById,
  fetchParkings,
  fetchParkingsWithRaw,
  MOBI_DATASET,
  PRIMARY_DATASET,
} from "./parkings";

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

function mobiRecord(
  recordid: string,
  fields: {
    id_parking: string;
    totalcapacity?: number;
    availablecapacity?: number;
    parkingdatalink?: string;
    binnenlez?: boolean;
  },
) {
  return {
    recordid,
    fields: {
      id_parking: fields.id_parking,
      parkingdatalink: fields.parkingdatalink ?? "Interparking Kouter",
      description: "",
      urllinkaddress: "",
      openingtimesdescription: "",
      fotourl: "",
      totalcapacity: fields.totalcapacity ?? 500,
      availablecapacity: fields.availablecapacity ?? 250,
      isopennow: 1,
      temporaryclosed: 0,
      binnenlez: fields.binnenlez ?? true,
      type: "carPark",
      locationanddimension: "",
      lastupdate: "",
    },
  };
}

function mobiResponse(records: ReturnType<typeof mobiRecord>[]) {
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

beforeEach(() => {
  routes = new Map();
  mockFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- tests ------------------------------------------------------------------

describe("fetchParkings — happy path", () => {
  it("merges primary feed with mobi fallback (Kouter/Zuid/Center) and sorts by name", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
      primaryRecord("p2", { name: "Dampoort", id: "https://example.com/parkings/parking-dampoort" }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([
      mobiRecord("m1", { id_parking: "P Kouter" }),
      mobiRecord("m2", { id_parking: "P Zuid" }),
      // An unrelated parking outside the allow-list — must be ignored.
      mobiRecord("m3", { id_parking: "P Antwerpen" }),
    ])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const parkings = await fetchParkings();

    const ids = parkings.map((p) => p.id);
    expect(ids).toContain("parking-tolhuis");
    expect(ids).toContain("parking-dampoort");
    expect(ids).toContain("parking-kouter");
    expect(ids).toContain("parking-zuid");
    // Outside the allow-list — never adopted.
    expect(ids).not.toContain("p-antwerpen");
    // Stable name sort.
    expect(parkings.map((p) => p.name)).toEqual(
      [...parkings.map((p) => p.name)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("uses stable Interparking ids regardless of operator string", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", ok(mobiResponse([
      mobiRecord("m1", { id_parking: "P Kouter", parkingdatalink: "Interparking Kouter" }),
    ])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const parkings = await fetchParkings();
    expect(parkings.map((p) => p.id)).toEqual(["parking-kouter"]);
    expect(parkings[0].name).toBe("Kouter");
    expect(parkings[0].operator).toBe("Interparking");
  });
});

describe("fetchParkings — graceful degradation", () => {
  it("still returns primary parkings when mobi feed fails", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis" }),
    ])));
    route("dataset=mobi-parkings", fail(503));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const parkings = await fetchParkings();
    expect(parkings.map((p) => p.name)).toEqual(["Tolhuis"]);
  });

  it("still returns parkings (with empty addresses) when locations feed fails", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis" }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", fail());

    const parkings = await fetchParkings();
    expect(parkings).toHaveLength(1);
    expect(parkings[0].address).toBe("");
  });

  it("survives both optional feeds failing simultaneously", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis" }),
    ])));
    route("dataset=mobi-parkings", fail());
    route("dataset=locaties-openbare-parkings-gent", fail());

    const parkings = await fetchParkings();
    expect(parkings).toHaveLength(1);
  });

  it("throws when the primary feed fails — the page can't render without it", async () => {
    route("dataset=bezetting-parkeergarages-real-time", fail(502));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    await expect(fetchParkings()).rejects.toThrow();
  });
});

describe("fetchParkings — mobi dedup", () => {
  it("does not double-add a parking that already exists in the primary feed", async () => {
    // Primary has a record that would normalize to id "parking-kouter".
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", {
        name: "Kouter (primary)",
        id: "https://example.com/parkings/parking-kouter",
      }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([
      mobiRecord("m1", { id_parking: "P Kouter" }),
    ])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const parkings = await fetchParkings();
    const kouters = parkings.filter((p) => p.id === "parking-kouter");
    expect(kouters).toHaveLength(1);
    // Primary wins — confirms the dedup keeps the primary entry rather than
    // overwriting with the mobi one.
    expect(kouters[0].name).toBe("Kouter (primary)");
  });

  it("drops mobi records with totalcapacity<=0", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", ok(mobiResponse([
      mobiRecord("m1", { id_parking: "P Kouter", totalcapacity: 0 }),
    ])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    expect(await fetchParkings()).toEqual([]);
  });
});

describe("fetchParkings — address enrichment", () => {
  it("fills empty addresses from the locations dataset using name-key matching", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      // No locationanddimension → empty address from normalization.
      primaryRecord("p1", { name: "B-Park Dampoort" }),
      primaryRecord("p2", { name: "Het Getouw" }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    // Locations dataset uses bare names — normalizeNameKey strips "b-park"
    // and "het" prefixes so they match.
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([
      locationRecord("l1", { naam: "Dampoort", straatnaam: "Koopvaardijlaan", huisnr: "5" }),
      locationRecord("l2", { naam: "Getouw", straatnaam: "Wiedauwkaai" }),
    ])));

    const parkings = await fetchParkings();
    const dampoort = parkings.find((p) => p.name === "B-Park Dampoort")!;
    const getouw = parkings.find((p) => p.name === "Het Getouw")!;
    expect(dampoort.address).toBe("Koopvaardijlaan 5");
    expect(getouw.address).toBe("Wiedauwkaai");
  });

  it("does not overwrite an address that the primary feed already provided", async () => {
    const loc = JSON.stringify({ roadName: "Original Street 9" });
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Dampoort", locationanddimension: loc }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([
      locationRecord("l1", { naam: "Dampoort", straatnaam: "Other Street", huisnr: "1" }),
    ])));

    const parkings = await fetchParkings();
    expect(parkings[0].address).toBe("Original Street 9");
  });

  it("uses ADDRESS_OVERRIDES (e.g. 'The Loop') ahead of the locations dataset", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "The Loop" }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    // Even if locations had a different address for "the loop", the override wins.
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([
      locationRecord("l1", { naam: "The Loop", straatnaam: "Wrong Street" }),
    ])));

    const parkings = await fetchParkings();
    expect(parkings[0].address).toBe("Louis Blériotlaan");
  });

  it("drops conflicting addresses in the locations dataset (multiple straatnamen for the same name-key)", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Ambiguous" }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([
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
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const { calls } = await fetchParkingsWithRaw();
    expect(calls.map((c) => c.id).sort()).toEqual([
      "bezetting-parkeergarages-real-time",
      "locaties-openbare-parkings-gent",
      "mobi-parkings",
    ]);
    expect(calls.every((c) => c.ok)).toBe(true);
  });

  it("records a failed call with ok=false instead of swallowing it", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", fail(503));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const { calls } = await fetchParkingsWithRaw();
    const mobi = calls.find((c) => c.id === "mobi-parkings");
    expect(mobi).toBeDefined();
    expect(mobi!.ok).toBe(false);
  });
});

describe("fetchParkingById", () => {
  it("returns the matching parking", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
    ])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const found = await fetchParkingById("parking-tolhuis");
    expect(found?.name).toBe("Tolhuis");
  });

  it("returns null when no parking matches", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    expect(await fetchParkingById("missing")).toBeNull();
  });
});

describe("fetchParkingDetailById", () => {
  it("tags the source as the primary dataset when found there", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([
      primaryRecord("p1", { name: "Tolhuis", id: "https://example.com/parkings/parking-tolhuis" }),
    ])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const detail = await fetchParkingDetailById("parking-tolhuis");
    expect(detail?.source).toBe(PRIMARY_DATASET);
    expect(detail?.parking.name).toBe("Tolhuis");
  });

  it("falls through to the mobi feed when the parking is not in the primary one", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", ok(mobiResponse([
      mobiRecord("m1", { id_parking: "P Kouter" }),
    ])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    const detail = await fetchParkingDetailById("parking-kouter");
    expect(detail?.source).toBe(MOBI_DATASET);
    expect(detail?.parking.id).toBe("parking-kouter");
  });

  it("returns null when nowhere", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", ok(mobiResponse([])));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    expect(await fetchParkingDetailById("nope")).toBeNull();
  });

  it("returns null (rather than throwing) when mobi-fallback lookup fails for an unknown id", async () => {
    route("dataset=bezetting-parkeergarages-real-time", ok(primaryResponse([])));
    route("dataset=mobi-parkings", fail(500));
    route("dataset=locaties-openbare-parkings-gent", ok(locationsResponse([])));

    expect(await fetchParkingDetailById("missing")).toBeNull();
  });
});
