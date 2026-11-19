import { describe, expect, it } from "vitest";
import {
  directoryFacts,
  matchDirectory,
  localizedNote,
  noteFor,
  parseDirectory,
  type DirectoryEntry,
} from "./directory";

// Records as the city publishes them (November 2026), trimmed to the fields
// we read.
function record(overrides: Record<string, unknown> = {}) {
  return {
    parking: "P",
    naam: "Kouter",
    url: "https://www.interparking.be/nl/parkeren/gent/kouter/",
    type: "Parking",
    straatnaam: "Kouter",
    huisnr: "31",
    capaciteit: 461,
    urid: "mob/parking1067",
    infotekst: "Onbewaakte fietsenstalling.",
    enginfotekst: "Unguarded bicycle parking facility.",
    frinfotekst: "Local à vélos sans surveillance.",
    geo_point_2d: { lat: 51.0501, lon: 3.7236 },
    ...overrides,
  };
}

const parse = (...records: unknown[]) => parseDirectory({ total_count: records.length, results: records });

describe("parseDirectory", () => {
  it("reads a garage", () => {
    expect(parse(record())).toEqual([
      {
        id: "p-kouter",
        name: "Kouter",
        parkAndRide: false,
        capacity: 461,
        address: "Kouter 31",
        lat: 51.0501,
        lng: 3.7236,
        url: "https://www.interparking.be/nl/parkeren/gent/kouter/",
        note: {
          nl: "Onbewaakte fietsenstalling.",
          en: "Unguarded bicycle parking facility.",
          fr: "Local à vélos sans surveillance.",
        },
        isFree: null,
        evChargers: 0,
        evMaxKw: null,
      },
    ]);
  });

  it("recognises a Park & Ride and gives it its own kind of id", () => {
    const [entry] = parse(
      record({ parking: "P+R", type: "Park and Ride", naam: "Lübeck", huisnr: null, straatnaam: "Afrikalaan" }),
    );
    expect(entry).toMatchObject({ id: "pr-lubeck", parkAndRide: true, address: "Afrikalaan" });
  });

  it("learns free or paid only from the city's note", () => {
    const [free, paid, unknown] = parse(
      record({ naam: "A", infotekst: "P+R gratis. Naar het centrum in 15 min met Bus 11.\nRolstoeltoegankelijk" }),
      record({ naam: "B", infotekst: "Parking betalend. Naar het centrum in 10 min met Tram 3." }),
      record({ naam: "C", infotekst: "Enkel bereikbaar via Vlaanderenstraat." }),
    );
    expect([free.isFree, paid.isFree, unknown.isFree]).toEqual([true, false, null]);
    // Line breaks in the note become spaces.
    expect(free.note?.nl).toBe("P+R gratis. Naar het centrum in 15 min met Bus 11. Rolstoeltoegankelijk");
  });

  it("reads the price from the opening sentence only", () => {
    const [paid, free, unknown] = parse(
      record({ naam: "A", infotekst: "Parking betalend. Gratis fietsenstalling." }),
      record({ naam: "B", infotekst: "P+R gratis. Betalend na 24 uur." }),
      record({ naam: "C", infotekst: "Onbewaakte fietsenstalling. Gratis." }),
    );
    expect([paid.isFree, free.isFree, unknown.isFree]).toEqual([false, true, null]);
  });

  it('treats "-" and empty notes as no note', () => {
    const entries = parse(
      record({ naam: "A", infotekst: "-", enginfotekst: "-", frinfotekst: "-" }),
      record({ naam: "B", infotekst: null, enginfotekst: null, frinfotekst: null }),
      record({ naam: "C", infotekst: "  " }),
    );
    expect(entries.map((e) => e.note)).toEqual([null, null, null]);
  });

  it("skips records it can't place, keeps the rest", () => {
    const entries = parse(
      record({ naam: "No pin", geo_point_2d: null }),
      record({ naam: "" }),
      "not a record",
      record({ naam: "Zuid", capaciteit: 0, url: "javascript:alert(1)" }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "p-zuid", capacity: null, url: null });
  });

  it("keeps one entry per id", () => {
    expect(parse(record(), record())).toHaveLength(1);
  });

  it("rejects a response that isn't a list", () => {
    expect(() => parseDirectory({ error: "nope" })).toThrow();
  });
});

describe("noteFor", () => {
  const note = { nl: "Nederlands", en: "English", fr: "Français" };

  it("uses the visitor's language when the city wrote one", () => {
    expect(noteFor(note, "nl")).toBe("Nederlands");
    expect(noteFor(note, "fr")).toBe("Français");
    expect(noteFor(note, "en")).toBe("English");
  });

  it("falls back to English, then Dutch", () => {
    expect(noteFor(note, "de")).toBe("English");
    expect(noteFor({ nl: "Nederlands", en: null, fr: null }, "es")).toBe("Nederlands");
    expect(noteFor({ nl: "Nederlands", en: "English", fr: null }, "fr")).toBe("English");
    expect(noteFor(null, "en")).toBeNull();
  });
});

describe("localizedNote", () => {
  it("says which language the text is really in", () => {
    const note = { nl: "Nederlands", en: "English", fr: null };
    expect(localizedNote(note, "fr")).toEqual({ text: "English", lang: "en" });
    expect(localizedNote(note, "de")).toEqual({ text: "English", lang: "en" });
    expect(localizedNote(note, "nl")).toEqual({ text: "Nederlands", lang: "nl" });
    expect(localizedNote({ nl: "Nederlands", en: null, fr: null }, "es")).toEqual({
      text: "Nederlands",
      lang: "nl",
    });
    expect(localizedNote({ nl: "N", en: "E", fr: "F" }, "fr")).toEqual({ text: "F", lang: "fr" });
    expect(localizedNote(null, "en")).toBeNull();
  });
});

function entry(overrides: Partial<DirectoryEntry>): DirectoryEntry {
  return {
    id: "p-x",
    name: "X",
    parkAndRide: false,
    capacity: null,
    address: "",
    lat: 51.05,
    lng: 3.72,
    url: null,
    note: null,
    isFree: null,
    evChargers: 0,
    evMaxKw: null,
    ...overrides,
  };
}

// Real positions: the live feed's pin and the directory's pin for the same
// garage are up to ~180 m apart, while Kouter and Savaan are different
// garages only ~150 m apart.
const SAVAAN = { id: "parking-savaan", name: "Savaan", lat: 51.04877, lng: 3.72395 };
const DOK_NOORD = { id: "parking-dok-noord", name: "Dok noord", lat: 51.06499, lng: 3.73291 };
const THE_LOOP = { id: "mobiliteit-loop", name: "The Loop", lat: 51.0244, lng: 3.6955 };
const STATION = { id: "gentstpieters", name: "B-Park Gent Sint-Pieters", lat: 51.0349, lng: 3.7078 };
const LIVE = [SAVAAN, DOK_NOORD, THE_LOOP, STATION];

describe("matchDirectory", () => {
  it("recognises a live garage by its position", () => {
    const savaan = entry({ id: "p-savaan", name: "Savaan", lat: 51.04895, lng: 3.72405 });
    const { extras, byLiveId } = matchDirectory([savaan], LIVE);
    expect(extras).toEqual([]);
    expect(byLiveId["parking-savaan"]).toEqual([savaan]);
  });

  it("keeps a different garage 150 m away as its own car park", () => {
    const kouter = entry({ id: "p-kouter", name: "Kouter", lat: 51.05012, lng: 3.72365 });
    expect(matchDirectory([kouter], LIVE).extras).toEqual([kouter]);
  });

  it("recognises a garage by name when the pins are far apart", () => {
    const dokNoord = entry({ id: "p-dok-noord", name: "Dok Noord", lat: 51.0662, lng: 3.7345 });
    expect(matchDirectory([dokNoord], LIVE).byLiveId["parking-dok-noord"]).toEqual([dokNoord]);
  });

  it('files "The Loop C" under the live feed\'s single "The Loop"', () => {
    const loopC = entry({ id: "p-the-loop-c", name: "The Loop C", lat: 51.0222, lng: 3.6978 });
    expect(matchDirectory([loopC], LIVE).byLiveId["mobiliteit-loop"]).toEqual([loopC]);
  });

  it("doesn't match on a name that merely starts the same", () => {
    const zuiderpoort = entry({ id: "p-zuiderpoort", name: "Zuiderpoort", lat: 51.0375, lng: 3.7366 });
    const zuid = { id: "parking-zuid", name: "Zuid", lat: 51.0419, lng: 3.7266 };
    expect(matchDirectory([zuiderpoort], [zuid]).extras).toEqual([zuiderpoort]);
  });

  it("treats everything as extra when the live feed is empty", () => {
    const kouter = entry({ id: "p-kouter", name: "Kouter" });
    expect(matchDirectory([kouter], [])).toEqual({ extras: [kouter], byLiveId: {} });
  });

  it("ignores live garages without a position unless the name matches", () => {
    const noPin = { id: "parking-reep", name: "Reep", lat: null, lng: null };
    const reep = entry({ id: "p-reep", name: "Reep" });
    const other = entry({ id: "p-other", name: "Other" });
    const { extras, byLiveId } = matchDirectory([reep, other], [noPin]);
    expect(byLiveId["parking-reep"]).toEqual([reep]);
    expect(extras).toEqual([other]);
  });
});

describe("directoryFacts", () => {
  it("marks a garage that is also listed as Park & Ride, and takes the first note", () => {
    const garage = entry({ id: "p-gent-sint-pieters", name: "Gent Sint-Pieters" });
    const parkAndRide = entry({
      id: "pr-sint-pietersstation",
      name: "Sint-Pietersstation",
      parkAndRide: true,
      note: { nl: "Opmerking", en: "Remark", fr: null },
    });
    expect(directoryFacts([garage, parkAndRide])).toEqual({
      parkAndRide: true,
      note: { nl: "Opmerking", en: "Remark", fr: null },
    });
  });

  it("has nothing to add for a garage the directory doesn't know", () => {
    expect(directoryFacts(undefined)).toEqual({ parkAndRide: false, note: null });
  });
});
