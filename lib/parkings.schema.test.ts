import { describe, expect, it } from "vitest";
import { normalizeParking } from "./parkings.schema";

type Fields = Parameters<typeof normalizeParking>[0]["fields"];

function record(fields: Partial<Fields> = {}, recordid = "r1") {
  const defaults: Fields = {
    name: "Test",
    description: "",
    openingtimesdescription: "",
    urllinkaddress: "",
    freeparking: 0,
    occupation: 0,
    availablecapacity: 0,
    totalcapacity: 0,
    temporaryclosed: 0,
    isopennow: 0,
    categorie: "",
    type: "",
    operatorinformation: "",
    occupancytrend: "unknown",
    lastupdate: "",
    id: "",
    locationanddimension: "",
    fotourl: "",
  };
  return { recordid, fields: { ...defaults, ...fields } };
}

describe("normalizeParking — capacity & live-data sentinel", () => {
  it("clamps availablecapacity=-1 to 0 free spaces and flags hasLiveData=false", () => {
    const p = normalizeParking(
      record({ totalcapacity: 100, availablecapacity: -1, isopennow: 1 }),
    );
    expect(p.freeSpaces).toBe(0);
    expect(p.hasLiveData).toBe(false);
    // Closed bucket prevents the gauge from painting red at 0%
    expect(p.bucket).toBe("closed");
  });

  it("flags hasLiveData=false when totalcapacity is 0", () => {
    const p = normalizeParking(
      record({ totalcapacity: 0, availablecapacity: 0, isopennow: 1 }),
    );
    expect(p.hasLiveData).toBe(false);
    expect(p.freePercent).toBe(0);
    expect(p.totalSpaces).toBe(0);
  });

  it("computes free/occupied percent from live counts and they sum to 100", () => {
    const p = normalizeParking(
      record({ totalcapacity: 200, availablecapacity: 50, isopennow: 1 }),
    );
    expect(p.freeSpaces).toBe(50);
    expect(p.freePercent).toBe(25);
    expect(p.occupiedPercent).toBe(75);
    expect(p.freePercent + p.occupiedPercent).toBe(100);
    expect(p.hasLiveData).toBe(true);
  });
});

describe("normalizeParking — open/closed state", () => {
  it("is closed when isopennow=0", () => {
    const p = normalizeParking(record({ isopennow: 0, totalcapacity: 100 }));
    expect(p.isOpen).toBe(false);
  });

  it("is closed when temporaryclosed=1 even if isopennow=1", () => {
    const p = normalizeParking(
      record({ isopennow: 1, temporaryclosed: 1, totalcapacity: 100 }),
    );
    expect(p.isOpen).toBe(false);
    expect(p.isTemporaryClosed).toBe(true);
  });

  it("is open when isopennow=1 and not temporarily closed", () => {
    const p = normalizeParking(
      record({ isopennow: 1, temporaryclosed: 0, totalcapacity: 100 }),
    );
    expect(p.isOpen).toBe(true);
    expect(p.isTemporaryClosed).toBe(false);
  });
});

describe("normalizeParking — bucket boundaries", () => {
  it("classifies <5% free as full", () => {
    const p = normalizeParking(
      record({ totalcapacity: 100, availablecapacity: 4, isopennow: 1 }),
    );
    expect(p.bucket).toBe("full");
  });

  it("classifies 5%–<20% free as almost-full", () => {
    const p = normalizeParking(
      record({ totalcapacity: 100, availablecapacity: 10, isopennow: 1 }),
    );
    expect(p.bucket).toBe("almost-full");
  });

  it("classifies >=20% free as available", () => {
    const p = normalizeParking(
      record({ totalcapacity: 100, availablecapacity: 20, isopennow: 1 }),
    );
    expect(p.bucket).toBe("available");
  });

  it("returns 'closed' bucket when the parking isn't open, regardless of capacity", () => {
    const p = normalizeParking(
      record({ totalcapacity: 100, availablecapacity: 80, isopennow: 0 }),
    );
    expect(p.bucket).toBe("closed");
  });
});

describe("normalizeParking — LEZ derivation", () => {
  it('"binnen LEZ" → inside', () => {
    const p = normalizeParking(record({ categorie: "binnen LEZ" }));
    expect(p.isInsideLez).toBe(true);
    expect(p.categoryLabel).toBe("Inside LEZ");
  });

  it('"buiten LEZ" → outside (the substring "lez" must not flip it)', () => {
    const p = normalizeParking(record({ categorie: "buiten LEZ" }));
    expect(p.isInsideLez).toBe(false);
    expect(p.categoryLabel).toBe("Outside LEZ");
  });

  it("unknown category → outside, falls back to raw label", () => {
    const p = normalizeParking(record({ categorie: "weird" }));
    expect(p.isInsideLez).toBe(false);
    expect(p.categoryLabel).toBe("weird");
  });
});

describe("normalizeParking — id derivation", () => {
  it("uses the last URL path segment when id is a URL", () => {
    const p = normalizeParking(
      record({ id: "https://example.com/parkings/parking-tolhuis", name: "Tolhuis" }),
    );
    expect(p.id).toBe("parking-tolhuis");
  });

  it("slugifies the name when id is not a URL", () => {
    const p = normalizeParking(record({ id: "", name: "Sint-Pietersplein" }));
    expect(p.id).toBe("sint-pietersplein");
  });

  it("slugifies the name when id is non-URL garbage", () => {
    const p = normalizeParking(record({ id: "not a url", name: "Dok Noord" }));
    expect(p.id).toBe("dok-noord");
  });
});

describe("normalizeParking — photoUrl", () => {
  it("returns null when fotourl is empty", () => {
    expect(normalizeParking(record({ fotourl: "" })).photoUrl).toBeNull();
  });

  it("returns null when fotourl is just whitespace", () => {
    expect(normalizeParking(record({ fotourl: "   " })).photoUrl).toBeNull();
  });

  it("returns the trimmed URL when present", () => {
    expect(
      normalizeParking(record({ fotourl: "  https://x/y.jpg  " })).photoUrl,
    ).toBe("https://x/y.jpg");
  });
});

describe("normalizeParking — location parsing", () => {
  it("strips the '9000 Gent' suffix from roadName", () => {
    const loc = JSON.stringify({ roadName: "Vrijdagmarkt 1\n9000 Gent" });
    const p = normalizeParking(record({ locationanddimension: loc }));
    expect(p.address).toBe("Vrijdagmarkt 1");
  });

  it("treats '?' as missing address", () => {
    const loc = JSON.stringify({ roadName: "?" });
    const p = normalizeParking(record({ locationanddimension: loc }));
    expect(p.address).toBe("");
  });

  it("extracts lat/lng/phone when present", () => {
    const loc = JSON.stringify({
      roadName: "Test 1",
      coordinatesForDisplay: { latitude: 51.05, longitude: 3.72 },
      contactDetailsTelephoneNumber: "+32 9 123 45 67",
    });
    const p = normalizeParking(record({ locationanddimension: loc }));
    expect(p.lat).toBe(51.05);
    expect(p.lng).toBe(3.72);
    expect(p.phone).toBe("+32 9 123 45 67");
  });

  it("returns nulls/empty on malformed JSON", () => {
    const p = normalizeParking(record({ locationanddimension: "{not json" }));
    expect(p.address).toBe("");
    expect(p.lat).toBeNull();
    expect(p.lng).toBeNull();
    expect(p.phone).toBeNull();
  });

  it("treats '?' phone as missing", () => {
    const loc = JSON.stringify({
      roadName: "Test",
      contactDetailsTelephoneNumber: "?",
    });
    expect(normalizeParking(record({ locationanddimension: loc })).phone).toBeNull();
  });
});

describe("normalizeParking — type label", () => {
  it("maps carPark → Indoor garage", () => {
    expect(normalizeParking(record({ type: "carPark" })).typeLabel).toBe(
      "Indoor garage",
    );
  });

  it("maps offStreetParkingGround → Surface lot", () => {
    expect(
      normalizeParking(record({ type: "offStreetParkingGround" })).typeLabel,
    ).toBe("Surface lot");
  });

  it("falls back to the raw type when unmapped", () => {
    expect(normalizeParking(record({ type: "weird" })).typeLabel).toBe("weird");
  });
});
