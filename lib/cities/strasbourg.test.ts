import { describe, expect, it } from "vitest";
import { parseLocations, parseOccupancy, toParkings } from "./strasbourg";

// Records as the Eurométropole publishes them (November 2026), trimmed.
const OCCUPANCY = {
  total_count: 4,
  results: [
    { nom_parking: "Parking Gare Wodli", idsurfs: "1382_DEP_8", ident: 10, etat: 1, etat_descriptif: "Ouvert", total: 955, libre: 135, realtimestatus: "ORANGE", ts: "2026-11-19T18:30:30+00:00" },
    { nom_parking: "Parking Zénith", idsurfs: "1400_DEP_26", ident: 1, etat: 2, etat_descriptif: "Fermé", total: 3175, libre: 3175, ts: "2026-11-19T18:30:30+00:00" },
    { nom_parking: "Parking Rotonde", idsurfs: "9_DEP_1", ident: 3, etat: 0, etat_descriptif: "frequentation temps reel indisponible", total: 430, libre: 0, ts: "2026-11-19T18:30:30+00:00" },
    { nom_parking: "Parking Sans Fiche", idsurfs: null, ident: 99, etat: 1, total: "100", libre: "120", ts: null },
    { nom_parking: "broken", etat: "open" },
    "junk",
  ],
};
const LOCATIONS = {
  results: [
    { idsurfs: "1382_DEP_8", name: "Parking Gare Wodli", address: "15 Rue Wodli 67000 Strasbourg France", phone: "03 88 00 00 00", position: { lon: 7.7361, lat: 48.5869 }, friendlyurl: "https://www.strasbourg.eu/lieu/-/entity/id/1/parking-gare-wodli", normalizedalias: "parking-gare-wodli" },
    { idsurfs: "9_DEP_1", name: "Parking Rotonde", address: null, phone: "", position: null, friendlyurl: null, normalizedalias: null },
    { no: "id" },
  ],
};

const parkings = () => toParkings(parseOccupancy(OCCUPANCY), parseLocations(LOCATIONS));

describe("Strasbourg", () => {
  it("skips rows it cannot read", () => {
    expect(parseOccupancy(OCCUPANCY)).toHaveLength(4);
    expect(parseLocations(LOCATIONS)).toHaveLength(2);
    expect(() => parseOccupancy({ error_code: "ODSQLError" })).toThrow();
  });

  it("turns an open car park into the same shape Ghent's garages have", () => {
    const [wodli] = parkings();
    expect(wodli).toMatchObject({
      id: "parking-gare-wodli",
      name: "Parking Gare Wodli",
      isOpen: true,
      hasLiveData: true,
      totalSpaces: 955,
      freeSpaces: 135,
      bucket: "almost-full",
      address: "15 Rue Wodli 67000 Strasbourg",
      lat: 48.5869,
      lng: 7.7361,
      phone: "03 88 00 00 00",
      websiteUrl: "https://www.strasbourg.eu/lieu/-/entity/id/1/parking-gare-wodli",
      parkAndRide: false,
    });
    expect(Math.round(wodli.freePercent)).toBe(14);
  });

  it("reads the feed's time as the clock in Strasbourg, whatever zone it claims", () => {
    // 18:30:30 on a November evening there is 17:30:30 UTC.
    expect(parkings()[0].lastUpdatedAt).toBe(Date.UTC(2026, 10, 19, 17, 30, 30));
    expect(parkings()[3].lastUpdatedAt).toBeNull();
  });

  it("marks a closed car park closed and one without a count as having none", () => {
    const [, zenith, rotonde] = parkings();
    expect(zenith).toMatchObject({ isOpen: false, hasLiveData: true, bucket: "closed" });
    expect(rotonde).toMatchObject({ isOpen: true, hasLiveData: false, freeSpaces: 0, bucket: "closed", parkAndRide: false });
  });

  it("copes with a car park that has no entry in the list of places", () => {
    const [, , rotonde, lone] = parkings();
    expect(rotonde).toMatchObject({ id: "parking-rotonde", lat: null, lng: null, address: "", phone: null });
    // Text numbers are read, and more free spaces than spaces is capped.
    expect(lone).toMatchObject({ id: "parking-sans-fiche", totalSpaces: 100, freeSpaces: 100, lat: null });
  });
});
